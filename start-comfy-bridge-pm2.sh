#!/bin/sh
set -eu

APP_NAME=${APP_NAME:-comfy-bridge}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=${APP_DIR:-$SCRIPT_DIR/comfy-bridge-node}

if [ ! -d "$APP_DIR" ]; then
  echo "APP_DIR not found: $APP_DIR" >&2
  echo "Set APP_DIR=/path/to/comfy-bridge-node and rerun." >&2
  exit 1
fi

cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "node not found in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found in PATH. Install it with: npm install -g pm2" >&2
  exit 1
fi

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "Created .env from .env.example; please review it if needed."
fi

mkdir -p data

if [ ! -d node_modules ]; then
  npm install
fi

npm run build

# Export simple KEY=VALUE lines from .env into this shell for PM2.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start dist/server.js \
    --name "$APP_NAME" \
    --cwd "$APP_DIR" \
    --time \
    --update-env
fi

pm2 save
pm2 status "$APP_NAME"

echo ""
echo "App started under PM2 as: $APP_NAME"
echo "Health check: curl http://127.0.0.1:${PORT:-3000}/health"
echo "Docs:        curl http://127.0.0.1:${PORT:-3000}/docs"
echo ""
echo "To enable auto-start on reboot, run:"
echo "  pm2 startup"
echo "Then copy/paste the sudo command PM2 prints, and run:"
echo "  pm2 save"
