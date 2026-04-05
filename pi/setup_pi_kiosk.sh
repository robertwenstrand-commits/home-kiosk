#!/bin/bash
# ============================================================
# Pi Zero 2 Kiosk Setup — Browser-only mode
# The backend runs on your Synology. The Pi just shows it.
#
# Usage:
#   chmod +x setup_pi_kiosk.sh
#   sudo ./setup_pi_kiosk.sh http://YOUR-SYNOLOGY-IP:2004
# ============================================================
set -e

KIOSK_URL="${1:-http://192.168.1.100:2004}"
AUTOSTART_DIR="/home/pi/.config/autostart"

echo "======================================"
echo " Pi Zero 2 Kiosk — Browser Only"
echo " URL: $KIOSK_URL"
echo "======================================"

# ── System packages ────────────────────────────────────────────────────────
echo "[1/4] Installing packages..."
apt-get update -qq
apt-get install -y -qq \
  chromium-browser \
  xdotool \
  unclutter \
  fonts-liberation

# ── Disable screen blanking ────────────────────────────────────────────────
echo "[2/4] Disabling screen blanking..."
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/10-blanking.conf <<'EOF'
Section "ServerFlags"
  Option "BlankTime"   "0"
  Option "StandbyTime" "0"
  Option "SuspendTime" "0"
  Option "OffTime"     "0"
EndSection
EOF

# Also set via DPMS in case the above isn't applied
cat >> /home/pi/.bashrc <<'EOF'
# Disable screen blanking for kiosk
xset s off
xset s noblank
xset -dpms
EOF

# ── Autostart Chromium ─────────────────────────────────────────────────────
echo "[3/4] Configuring Chromium autostart..."
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Kiosk Browser
Exec=bash -c 'sleep 5 && chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-session-crashed-bubble \
  --disable-dev-shm-usage \
  --disable-gpu-sandbox \
  --use-gl=egl \
  --app=${KIOSK_URL}'
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

# Hide idle cursor
cat > "$AUTOSTART_DIR/unclutter.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Unclutter
Exec=unclutter -idle 3 -root
EOF

# ── Watchdog: restart Chromium if it crashes ──────────────────────────────
echo "[4/4] Installing Chromium watchdog..."
cat > /etc/systemd/system/kiosk-watchdog.service <<EOF
[Unit]
Description=Kiosk Chromium Watchdog
After=graphical.target

[Service]
User=pi
Environment=DISPLAY=:0
Restart=always
RestartSec=10
ExecStart=bash -c 'while true; do
  pgrep -x chromium-browser || (
    sleep 3
    chromium-browser --kiosk --noerrdialogs --disable-infobars \
      --no-first-run --disable-translate --disable-dev-shm-usage \
      --disable-gpu-sandbox --use-gl=egl --app=${KIOSK_URL}
  )
  sleep 15
done'

[Install]
WantedBy=graphical.target
EOF

systemctl daemon-reload
systemctl enable kiosk-watchdog

echo ""
echo "======================================"
echo " Setup complete!"
echo "======================================"
echo ""
echo " The Pi will open: $KIOSK_URL"
echo " on every boot, full-screen."
echo ""
echo " Reboot now:  sudo reboot"
echo ""
