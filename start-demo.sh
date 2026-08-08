#!/bin/bash
set -e

ROOT="$HOME/Development/nexus-pos"

echo "=== Nexus POS startup ==="

echo ""
echo "[1/3] Starting server via pm2..."
cd "$ROOT/apps/server"
pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart nexus-pos-server
sleep 1
curl -s http://localhost:4000/health && echo " -- server OK" || echo " -- server NOT responding, check 'pm2 logs'"

echo ""
echo "[2/3] ngrok tunnel"
if pgrep -f "ngrok http 4000" > /dev/null; then
  echo "ngrok already running."
else
  echo "ngrok is NOT running. Open a new terminal tab and run:"
  echo "  ngrok http 4000"
  echo "Then confirm the forwarding URL matches DARAJA_CALLBACK_URL in apps/server/.env"
fi

echo ""
echo "[3/3] Terminal app"
echo "Open a new terminal tab and run:"
echo "  cd $ROOT/apps/terminal && npm run dev"
echo ""
echo "For a second till, in another tab once the first is running:"
echo "  cd $ROOT/apps/terminal && npm run dev:terminal2"

echo ""
echo "=== Ready when server OK, ngrok running, and terminal(s) open ==="
