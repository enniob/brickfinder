#!/bin/bash
# update.sh — pull latest changes, rebuild, and restart services on the Pi
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Pulling latest changes..."
cd "$REPO_DIR"
git pull

echo "==> Rebuilding server..."
cd "$REPO_DIR/server"
npm install
npm run build

echo "==> Restarting legofinder service..."
sudo systemctl restart legofinder

echo "==> Rebuilding frontend..."
cd "$REPO_DIR/app"
npm install
npm run build

echo "==> Done. Nginx will serve the updated frontend automatically."
