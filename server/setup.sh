#!/bin/bash
# ============================================================
# Pi Zero 2 Kiosk Setup Script
# Run once on the Pi after copying the project files.
# Usage: chmod +x setup.sh && sudo ./setup.sh
# ============================================================
set -e

APP_DIR="/home/pi/kiosk"
SERVICE_NAME="kiosk"
AUTOSTART_DIR="/home/pi/.config/autostart"
CHROMIUM_FLAGS="--kiosk --noerrdialogs --disable-infobars --no-first-run \
  --disable-translate --disable-features=TranslateUI \
  --disable-session-crashed-bubble --disable-dev-shm-usage \
  --disable-gpu-sandbox --use-gl=egl \
  app=http://127.0.0.1:2004"

echo "======================================"
echo " Pi Zero 2 Kiosk Setup"
echo "======================================"

# ── System packages ────────────────────────────────────────────────────────
echo "[1/6] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
  python3-pip python3-venv \
  ffmpeg \
  chromium-browser \
  xdotool \
  unclutter \
  onboard \
  fonts-liberation

# ── Python virtualenv ──────────────────────────────────────────────────────
echo "[2/6] Setting up Python virtualenv..."
cd "$APP_DIR"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

# ── Systemd service ────────────────────────────────────────────────────────
echo "[3/6] Installing systemd service..."
cp "$APP_DIR/kiosk.service" /etc/systemd/system/kiosk.service
systemctl daemon-reload
systemctl enable kiosk
systemctl start kiosk
echo "   Backend service started."

# ── Display setup ──────────────────────────────────────────────────────────
echo "[4/6] Configuring display..."

# Disable screen blanking
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/10-blanking.conf <<'EOF'
Section "ServerFlags"
  Option "BlankTime"  "0"
  Option "StandbyTime" "0"
  Option "SuspendTime" "0"
  Option "OffTime"    "0"
EndSection
EOF

# ── Autostart Chromium in kiosk mode ──────────────────────────────────────
echo "[5/6] Configuring Chromium autostart..."
mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Kiosk
Exec=bash -c 'sleep 4 && chromium-browser $CHROMIUM_FLAGS'
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

# Hide cursor after inactivity
cat > "$AUTOSTART_DIR/unclutter.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Unclutter
Exec=unclutter -idle 3 -root
EOF

# ── .env file ─────────────────────────────────────────────────────────────
echo "[6/6] Checking configuration..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "   *** Created .env from .env.example ***"
  echo "   Edit /home/pi/kiosk/.env to configure:"
  echo "     - WYZE_RTSP_URL (your Wyze camera RTSP URL)"
  echo "     - GOOGLE_CALENDAR_IDS (your calendar IDs)"
fi

echo ""
echo "======================================"
echo " Setup complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Edit /home/pi/kiosk/.env with your settings"
echo "  2. For Google Calendar: run google_auth.py on a desktop machine,"
echo "     then copy data/token.pickle to the Pi"
echo "  3. For Wyze camera: enable RTSP in the Wyze app"
echo "     (Account → Advanced → RTSP), then add the URL to .env"
echo "  4. Reboot: sudo reboot"
echo ""
echo "Service status:  sudo systemctl status kiosk"
echo "Backend logs:    sudo journalctl -u kiosk -f"
echo ""
