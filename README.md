# Scope Web App

An AI chat app built on Cloudflare Workers AI. Uses Llama 4 Scout (17B) for both text and vision, stores conversations in SQLite, and optionally hooks into Brave Search to give the model live web results.

I built this as a personal project, and also as an addition to the actual Scope bot, which is a Discord and Roblox bot made with the goal of keeping players safe from possible predators.

![Dark mode screenshot](https://raw.githubusercontent.com/heyotw/scope-web/refs/heads/main/showcase/showcase-dark-mode.png)

---

## Features

- **Chat persistence** — conversations saved to SQLite, load any previous chat by URL UUID
- **Vision** — paste or drag any image into the chat, the model describes and reasons about it
- **Streaming** — responses render token by token with live markdown formatting
- **Web search** — toggle the 🌐 button to inject Brave Search results before the model answers
- **Dark / light mode** — smooth animated transition, preference saved to localStorage
- **Collapsible sidebars** — both panels slide out if you want more screen space
- **Cloudflare AI Gateway** — optional routing through the gateway for request logs and analytics

---

## Requirements

- A Linux server (Ubuntu 22.04+ recommended) with a way of engaging to the Internet
- Python 3.10+
- nginx
- A [Cloudflare](https://cloudflare.com) account (free tier works), or anything that provides OpenAI-compliant AI responses.
- Some subdomain pointing to you, or get ready to make a lot of changes.

Optional:
- A [Brave Search API](https://brave.com/search/api/) key

---

## Quick install

If you just want to get it running:

```bash
git clone https://github.com/heyotw/scope-web.git
mv scope-web scope
cd scope
sudo bash install.sh <your-domain>
```

Then edit `/var/www/scope/.env` with your keys and restart:

```bash
sudo systemctl restart scope
```

---

## Configuration reference

All config lives in `/var/www/scope/.env`.

| Variable | Required | Description |
|---|---|---|
| `CF_ACCOUNT_ID` | Yes | Your Cloudflare account ID |
| `CF_API_TOKEN` | Yes | API token with Workers AI Edit permission |
| `CF_GATEWAY_NAME` | No | AI Gateway slug for logging/analytics |
| `BRAVE_API_KEY` | No | Enables the web search toggle |
| `BASE_DIR` | No | App directory, default `/var/www/scope` |

After editing `.env`:

```bash
sudo systemctl restart scope
```

---

## AI Gateway setup (optional) [RECOMMENDED]

The AI Gateway gives you a log of every request, token counts, and error rates in the Cloudflare dashboard.

1. Go to dash.cloudflare.com → AI → AI Gateway → Create Gateway
2. Give it a name/slug — e.g. `scope`
3. Set `CF_GATEWAY_NAME=scope` in your `.env`
4. Restart the server

All inference requests will now route through
`gateway.ai.cloudflare.com/v1/{account_id}/scope/workers-ai/...` instead of the direct
Workers AI endpoint.

---

## Updating

```bash
cd ~/scope   # wherever you cloned it
git pull

sudo cp app.py index.html /var/www/scope/
sudo /var/www/scope/venv/bin/pip install -q -r requirements.txt
sudo systemctl restart scope
```

---

## Troubleshooting

**Images return a Cloudflare 3030 error**
- This means the payload was too large (usually base64 from a previous vision call still
  in the conversation history). The app strips image data from history after each vision
  call to prevent this — if you see it, try starting a new chat.
