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

## Manual install

If you want to change things.

### 1. Server basics

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv nginx git
```

### 2. Clone the repo

```bash
git clone https://github.com/heyotw/scope-web.git
mv scope-web scope
cd scope
```

### 3. Create the app directory

```bash
sudo mkdir -p /var/www/scope/uploads
sudo cp app.py index.html /var/www/scope/
```

### 4. Python virtual environment

```bash
sudo python3 -m venv /var/www/scope/venv
sudo /var/www/scope/venv/bin/pip install --upgrade pip
sudo /var/www/scope/venv/bin/pip install -r requirements.txt
```

### 5. Environment variables

```bash
sudo cp .env.example /var/www/scope/.env
sudo nano /var/www/scope/.env
```

Fill in at minimum `CF_ACCOUNT_ID` and `CF_API_TOKEN`. The others are optional.

How to get your Cloudflare credentials:
- **Account ID** — log into dash.cloudflare.com, it's in the right sidebar on the main page
- **API Token** — go to *Profile → API Tokens → Create Token*
  - Use the "Edit Cloudflare Workers" template or create a custom token
  - Permissions needed: `Account → Workers AI → Edit`

### 6. Accepting the model license

Llama 4 Scout requires a one-time agreement before it'll respond. Run this from your server:

```bash
source /var/www/scope/.env

curl -s \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/meta/llama-4-scout-17b-16e-instruct" \
  -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -d '{"prompt": "agree"}' | python3 -m json.tool
```

You should see a response about the agreement being accepted. You only need to do this once.

### 7. nginx

```bash
# edit the domain name first
sudo sed "s/your-domain.com/your-actual-domain.com/g" nginx.conf \
  > /etc/nginx/sites-available/scope

sudo ln -s /etc/nginx/sites-available/scope /etc/nginx/sites-enabled/scope
sudo rm -f /etc/nginx/sites-enabled/default   # remove default if present
sudo nginx -t && sudo systemctl reload nginx
```

### 8. systemd service

```bash
sudo cp scope.service /etc/systemd/system/scope.service
sudo chown -R www-data:www-data /var/www/scope
sudo systemctl daemon-reload
sudo systemctl enable scope
sudo systemctl start scope
```

Check it started:

```bash
sudo systemctl status scope
sudo journalctl -u scope -f   # live logs
```

### 9. HTTPS (optional but recommended)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will edit your nginx config and set up auto-renewal.

### 10. Verify

```bash
curl https://your-domain.com/api/health
```

Should return something like:

```json
{
  "ok": true,
  "model": "@cf/meta/llama-4-scout-17b-16e-instruct",
  "gateway": "scope",
  "search": true,
  "time": "2025-02-21T12:00:00Z"
}
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
