#!/bin/bash
# Start the kiosk application
# This script is called by the systemd service

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# Activate virtualenv if present
if [ -d "venv/bin" ]; then
  source venv/bin/activate
fi

exec python app.py
