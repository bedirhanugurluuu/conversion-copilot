#!/bin/sh
set -e

echo "[start] NODE_ENV=${NODE_ENV:-unset}"
echo "[start] PORT=${PORT:-3000}"
echo "[start] DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"
echo "[start] SHOPIFY_APP_URL=${SHOPIFY_APP_URL:-unset}"

if [ -z "$DATABASE_URL" ]; then
  echo "[start] ERROR: DATABASE_URL is required"
  exit 1
fi

echo "[start] Running database migrations..."
npx prisma migrate deploy

echo "[start] Starting HTTP server on 0.0.0.0:${PORT:-3000}..."
export HOST=0.0.0.0
exec npx react-router-serve ./build/server/index.js
