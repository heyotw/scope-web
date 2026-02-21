#!/usr/bin/env python3
"""
backend server for Scope

Runs on 127.0.0.1:5000
"""

import socket as _socket
_real_getaddrinfo = _socket.getaddrinfo
_socket.getaddrinfo = lambda host, port, family=0, *a, **kw: \
    _real_getaddrinfo(host, port, _socket.AF_INET, *a, **kw)

import io
import os
import uuid
import json
import base64
import logging
import sqlite3
import requests
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import (
    Flask, request, jsonify, abort,
    send_from_directory, Response, stream_with_context
)
from PIL import Image, UnidentifiedImageError

# -------------------------------------------------------------------------
# pull .env
# -------------------------------------------------------------------------
load_dotenv()

BASE_DIR     = Path(os.getenv("BASE_DIR", "/var/www/scope"))
UPLOAD_DIR   = BASE_DIR / "uploads"
DB_PATH      = BASE_DIR / "chats.db"

CF_ACCOUNT_ID  = os.getenv("CF_ACCOUNT_ID", "")
CF_API_TOKEN   = os.getenv("CF_API_TOKEN", "")
CF_GATEWAY     = os.getenv("CF_GATEWAY_NAME", "")   # optional, leave blank to skip gateway
BRAVE_API_KEY  = os.getenv("BRAVE_API_KEY", "")

# llama4
MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"

MAX_IMG_DIM  = 1920    # resize anything bigger than this before sending
JPEG_QUALITY = 88      # good balance between size and quality

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scope")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32MB upload cap


# -------------------------------------------------------------------------
# helper
# -------------------------------------------------------------------------

def require_env():
    """Check the critical env vars are present. Called per-request so the
    server starts up fine even if .env isn't configured yet — the error
    surfaces on the first actual API call instead of at boot."""
    if not CF_ACCOUNT_ID or not CF_API_TOKEN:
        raise RuntimeError(
            "CF_ACCOUNT_ID and CF_API_TOKEN must be set in .env"
        )


def infer_url() -> str:
    """Build the Cloudflare endpoint URL.
    If CF_GATEWAY_NAME is set we route through the AI Gateway, which gives
    you request logs and analytics in the Cloudflare dashboard. Otherwise
    we hit the Workers AI API directly."""
    if CF_GATEWAY:
        return (
            f"https://gateway.ai.cloudflare.com/v1"
            f"/{CF_ACCOUNT_ID}/{CF_GATEWAY}/workers-ai/{MODEL}"
        )
    return (
        f"https://api.cloudflare.com/client/v4"
        f"/accounts/{CF_ACCOUNT_ID}/ai/run/{MODEL}"
    )


def now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def row_to_dict(row) -> dict:
    return {
        "id":         row["id"],
        "title":      row["title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "messages":   json.loads(row["messages"]),
        "images":     json.loads(row["images"]),
    }


# -------------------------------------------------------------------------
# db
# -------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS chats (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL DEFAULT 'New Chat',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                messages   TEXT NOT NULL DEFAULT '[]',
                images     TEXT NOT NULL DEFAULT '[]'
            );
        """)
    log.info("DB ready at %s", DB_PATH)


# -------------------------------------------------------------------------
# image "vision"
# -------------------------------------------------------------------------

def process_image(raw: bytes, filename: str = "") -> bytes:
    """Convert any uploaded image to a JPEG we can send to the model.
    Handles palette/alpha modes, resizes if needed, and compresses."""
    try:
        img = Image.open(io.BytesIO(raw))
    except UnidentifiedImageError:
        raise ValueError(f"Unrecognised image format: {filename!r}")

    # Flatten anything with an alpha channel onto white
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > MAX_IMG_DIM:
        scale = MAX_IMG_DIM / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        log.info("Resized image %dx%d → %dx%d", w, h, *img.size)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue()


# -------------------------------------------------------------------------
# CORS — allow everything since nginx handles the actual domain restriction
# -------------------------------------------------------------------------

@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return response


@app.route("/api/<path:p>", methods=["OPTIONS"])
def preflight(p):
    return "", 204


# -------------------------------------------------------------------------
# inference
# -------------------------------------------------------------------------

@app.route("/api/infer", methods=["POST"])
def infer():
    try:
        require_env()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503

    body = request.get_json(silent=True)
    if not body or "messages" not in body:
        abort(400, description="Missing 'messages' in request body")

    # repetition_penalty is a mild penalty to reduce the chances of the model repeating itself
    payload = {
        "messages":           body["messages"],
        "stream":             True,
        "max_tokens":         body.get("max_tokens", 1024),
        "temperature":        body.get("temperature", 0.6),
        "repetition_penalty": body.get("repetition_penalty", 1.15),
    }

    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type":  "application/json",
    }

    url = infer_url()
    log.info("Infer → %s", url.split("/workers-ai/")[0] + "/workers-ai/...")

    def stream():
        try:
            with requests.post(
                url, json=payload, headers=headers,
                stream=True, timeout=120
            ) as resp:
                if resp.status_code != 200:
                    err = resp.text[:400]
                    log.error("Cloudflare %d: %s", resp.status_code, err)
                    yield f"data: {json.dumps({'error': f'Upstream {resp.status_code}: {err}'})}\n\n"
                    return

                for raw_line in resp.iter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.decode() if isinstance(raw_line, bytes) else raw_line

                    if line == "data: [DONE]":
                        yield "data: [DONE]\n\n"
                        return

                    if line.startswith("data: "):
                        try:
                            chunk = json.loads(line[6:])
                            token = chunk.get("response", "")
                            if token:
                                yield (
                                    f"data: {json.dumps({'choices':[{'delta':{'content':token}}]})}\n\n"
                                )
                        except json.JSONDecodeError:
                            pass

        except requests.RequestException as e:
            log.error("Request to Cloudflare failed: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(stream()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# -------------------------------------------------------------------------
# web search
# -------------------------------------------------------------------------

@app.route("/api/search", methods=["POST"])
def search():
    if not BRAVE_API_KEY:
        return jsonify({"error": "BRAVE_API_KEY not set in .env"}), 503

    body  = request.get_json(silent=True) or {}
    query = body.get("query", "").strip()
    if not query:
        return jsonify({"results": []})

    count = min(int(body.get("count", 6)), 10)

    try:
        resp = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": count},
            headers={
                "X-Subscription-Token": BRAVE_API_KEY,
                "Accept":               "application/json",
                "Accept-Encoding":      "gzip",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        log.error("Brave search error: %s", e)
        return jsonify({"error": f"Search failed: {e}"}), 502

    results = [
        {
            "title":       r.get("title", ""),
            "url":         r.get("url", ""),
            "description": r.get("description", ""),
            "age":         r.get("age", ""),
        }
        for r in data.get("web", {}).get("results", [])[:count]
    ]

    log.info("Search '%s' → %d results", query, len(results))
    return jsonify({"query": query, "results": results})


# -------------------------------------------------------------------------
# chat 
# -------------------------------------------------------------------------

@app.route("/api/chats", methods=["GET"])
def list_chats():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at "
            "FROM chats ORDER BY updated_at DESC LIMIT 50"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/chats", methods=["POST"])
def create_chat():
    data    = request.get_json(silent=True) or {}
    chat_id = str(uuid.uuid4())
    title   = (data.get("title") or "New Chat")[:120]
    t       = now_iso()

    with get_db() as conn:
        conn.execute(
            "INSERT INTO chats VALUES (?,?,?,?,?,?)",
            (chat_id, title, t, t, "[]", "[]"),
        )

    return jsonify({"id": chat_id, "title": title, "created_at": t, "messages": [], "images": []})


@app.route("/api/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
    if not row:
        abort(404)
    return jsonify(row_to_dict(row))


@app.route("/api/chats/<chat_id>", methods=["PUT"])
def update_chat(chat_id):
    data   = request.get_json(silent=True) or {}
    t      = now_iso()
    fields = {}

    if "title"    in data: fields["title"]    = str(data["title"])[:120]
    if "messages" in data: fields["messages"] = json.dumps(data["messages"])
    if "images"   in data: fields["images"]   = json.dumps(data["images"])

    if not fields:
        abort(400, description="Nothing to update")

    fields["updated_at"] = t
    clause = ", ".join(f"{k}=?" for k in fields)
    vals   = list(fields.values()) + [chat_id]

    with get_db() as conn:
        cur = conn.execute(f"UPDATE chats SET {clause} WHERE id=?", vals)
        if cur.rowcount == 0:
            abort(404)

    return jsonify({"ok": True, "updated_at": t})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    with get_db() as conn:
        conn.execute("DELETE FROM chats WHERE id=?", (chat_id,))

    # clean up uploaded images for this chat too
    uploads = UPLOAD_DIR / chat_id
    if uploads.exists():
        import shutil
        shutil.rmtree(uploads)

    return jsonify({"ok": True})


# -------------------------------------------------------------------------
# image upload
# -------------------------------------------------------------------------

@app.route("/api/chats/<chat_id>/images", methods=["POST"])
def upload_image(chat_id):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM chats WHERE id=?", (chat_id,)).fetchone():
            abort(404)

    # accept either multipart/form-data or a JSON body with a data_url
    if request.content_type and "multipart" in request.content_type:
        f = request.files.get("image")
        if not f:
            abort(400, description="No image field in form")
        raw      = f.read()
        filename = f.filename or "image"
    else:
        body     = request.get_json(silent=True) or {}
        data_url = body.get("data_url", "")
        if not data_url.startswith("data:"):
            abort(400, description="Expected a data_url")
        try:
            raw = base64.b64decode(data_url.split(",", 1)[1])
        except Exception:
            abort(400, description="Bad base64")
        filename = "paste"

    try:
        jpeg = process_image(raw, filename)
    except ValueError as e:
        abort(422, description=str(e))

    img_id  = str(uuid.uuid4())
    img_dir = UPLOAD_DIR / chat_id
    img_dir.mkdir(parents=True, exist_ok=True)
    (img_dir / f"{img_id}.jpg").write_bytes(jpeg)

    return jsonify({
        "image_id": img_id,
        "url":      f"/uploads/{chat_id}/{img_id}.jpg",
        "data_url": f"data:image/jpeg;base64,{base64.b64encode(jpeg).decode()}",
        "size":     len(jpeg),
    })


@app.route("/uploads/<chat_id>/<filename>")
def serve_upload(chat_id, filename):
    return send_from_directory(str(UPLOAD_DIR / chat_id), filename)


# -------------------------------------------------------------------------
# health check api
# -------------------------------------------------------------------------

@app.route("/api/health")
def health():
    return jsonify({
        "ok":      True,
        "model":   MODEL,
        "gateway": CF_GATEWAY or None,
        "search":  bool(BRAVE_API_KEY),
        "time":    now_iso(),
    })


# -------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=False)
