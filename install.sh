#!/usr/bin/env bash

set -e

DOMAIN=${1:-"localhost"}
INSTALL_DIR="/var/www/scope"
SERVICE_NAME="scope"

echo ""
echo "  ● Scope installer"
echo "  Domain: $DOMAIN"
echo "  Dir:    $INSTALL_DIR"
echo ""

# --- system deps ---
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv nginx certbot python3-certbot-nginx git

# --- app directory ---
mkdir -p "$INSTALL_DIR/uploads"
mkdir -p "$INSTALL_DIR/logs"

# copy files
cp app.py index.html "$INSTALL_DIR/"

# --- python venv ---
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -q -r requirements.txt

# --- .env ---
if [ ! -f "$INSTALL_DIR/.env" ]; then
    cp .env.example "$INSTALL_DIR/.env"
    echo ""
    echo "  ⚠  Created $INSTALL_DIR/.env from example."
    echo "     Fill in your CF_ACCOUNT_ID and CF_API_TOKEN before starting."
    echo ""
fi

# --- nginx ---
sed "s/your-domain.com/$DOMAIN/g" nginx.conf > /etc/nginx/sites-available/scope
ln -sf /etc/nginx/sites-available/scope /etc/nginx/sites-enabled/scope
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- systemd ---
cp scope.service /etc/systemd/system/scope.service
chown -R www-data:www-data "$INSTALL_DIR"
systemctl daemon-reload
systemctl enable scope
systemctl start scope

echo ""
echo "  ✓ Done. Check status with: systemctl status scope"
echo "  ✓ Then edit $INSTALL_DIR/.env and restart: systemctl restart scope"
echo ""

if [ "$DOMAIN" != "localhost" ]; then
    echo "  To add HTTPS:"
    echo "    certbot --nginx -d $DOMAIN"
    echo ""
fi
