#!/bin/bash
# ============================================================
# Orange Pi Zero 2W Kiosk Setup — Armbian Minimal
# The backend runs on your Synology. The board just shows it.
#
# Usage:
#   chmod +x setup_pi_kiosk.sh
#   sudo ./setup_pi_kiosk.sh http://YOUR-SYNOLOGY-IP:2004
# ============================================================
set -e

KIOSK_URL="${1:-http://192.168.1.41:2004}"

# Resolve the real user who invoked sudo (never run browser as root)
KIOSK_USER="${SUDO_USER:-orangepi}"
KIOSK_HOME="/home/${KIOSK_USER}"

# Chromium flags — defined once, used in both autostart and watchdog service
CHROMIUM_FLAGS="--kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --no-memcheck \
  --disable-translate \
  --disable-features=TranslateUI \
  --disable-session-crashed-bubble \
  --disable-dev-shm-usage \
  --disable-gpu \
  --touch-events=enabled \
  --enable-pinch \
  --overscroll-history-navigation=0 \
  --app=${KIOSK_URL}"

echo "======================================"
echo " Orange Pi Zero 2W Kiosk — Armbian"
echo " URL:  $KIOSK_URL"
echo " User: $KIOSK_USER"
echo "======================================"

# ── System packages ────────────────────────────────────────────────────────
echo "[1/5] Installing packages..."
apt-get update -qq
apt-get install -y -qq \
  xserver-xorg-core \
  xserver-xorg-input-evdev \
  xinit \
  openbox \
  lightdm \
  chromium \
  x11-xserver-utils \
  xdotool \
  unclutter \
  fonts-liberation \
  fonts-noto-color-emoji \
  dbus-x11

# ── LightDM autologin ──────────────────────────────────────────────────────
echo "[2/5] Configuring autologin..."

# Ensure home dir is owned by the kiosk user (can end up as root if useradd -M was used)
chown "${KIOSK_USER}:${KIOSK_USER}" "${KIOSK_HOME}"

# Add user to autologin group (Debian/Armbian require this for LightDM autologin)
groupadd -rf autologin
gpasswd -a "${KIOSK_USER}" autologin

mkdir -p /etc/lightdm/lightdm.conf.d
cat > /etc/lightdm/lightdm.conf.d/50-kiosk.conf <<EOF
[Seat:*]
autologin-user=${KIOSK_USER}
autologin-user-timeout=0
user-session=openbox
EOF

# ── Disable screen blanking ────────────────────────────────────────────────
echo "[3/5] Disabling screen blanking..."
mkdir -p /etc/X11/xorg.conf.d
cat > /etc/X11/xorg.conf.d/10-blanking.conf <<'EOF'
Section "ServerFlags"
  Option "BlankTime"   "0"
  Option "StandbyTime" "0"
  Option "SuspendTime" "0"
  Option "OffTime"     "0"
EndSection
EOF

# ── Openbox autostart ──────────────────────────────────────────────────────
echo "[4/5] Configuring Openbox autostart..."
OPENBOX_DIR="${KIOSK_HOME}/.config/openbox"
mkdir -p "$OPENBOX_DIR"

cat > "${OPENBOX_DIR}/autostart" <<EOF
xset s off &
xset s noblank &
xset -dpms &
unclutter -idle 0.1 -root &

# Wait for X to be ready before launching browser
until xset q &>/dev/null; do sleep 0.5; done

# Launch Chromium in a restart loop — revives it if it ever crashes
(
  while true; do
    chromium ${CHROMIUM_FLAGS}
    sleep 2
  done
) &
EOF

chown -R "${KIOSK_USER}:${KIOSK_USER}" "${KIOSK_HOME}/.config"

echo "[5/6] Installing UPS monitor service..."
apt-get install -y -qq python3-serial

cat > /usr/local/bin/ups-monitor.py <<'PYEOF'
#!/usr/bin/env python3
"""
UPS Monitor — reads RPi UPSPack V3P via UART and serves JSON on port 7070.
"""
import re
import serial
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

PORT = 7070
SERIAL_DEV = "/dev/ttyS0"
BAUD = 9600

ups_data = {
    "model": None,
    "vin_good": None,
    "battery_pct": None,
    "vout_mv": None,
    "updated": None
}
lock = threading.Lock()

# Model name contains a space (e.g. "SmartUPS V3.2P"), so use [^,]+ not \S+
PATTERN = re.compile(r'\$ ([^,]+),(Vin \S+),BATCAP (\d+),Vout (\d+) \$')

def read_ups():
    while True:
        try:
            with serial.Serial(SERIAL_DEV, BAUD, timeout=5) as s:
                while True:
                    line = s.readline().decode(errors="ignore").strip()
                    m = PATTERN.search(line)
                    if m:
                        with lock:
                            ups_data["model"] = m.group(1)
                            ups_data["vin_good"] = m.group(2) == "Vin GOOD"
                            ups_data["battery_pct"] = int(m.group(3))
                            ups_data["vout_mv"] = int(m.group(4))
                            ups_data["updated"] = time.time()
        except Exception:
            time.sleep(5)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/ups":
            with lock:
                payload = json.dumps(ups_data)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload.encode())
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *args):
        pass

t = threading.Thread(target=read_ups, daemon=True)
t.start()

print(f"UPS monitor serving on port {PORT}")
HTTPServer(("", PORT), Handler).serve_forever()
PYEOF

chmod +x /usr/local/bin/ups-monitor.py

# Disable serial console so /dev/ttyS0 is free for UPS
systemctl disable --now serial-getty@ttyS0.service 2>/dev/null || true
systemctl mask serial-getty@ttyS0.service 2>/dev/null || true

cat > /etc/systemd/system/ups-monitor.service <<'EOF'
[Unit]
Description=UPS Monitor (RPi UPSPack V3P)
After=network.target

[Service]
ExecStart=/usr/bin/python3 /usr/local/bin/ups-monitor.py
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

echo "[6/6] Enabling services..."
systemctl daemon-reload
systemctl enable lightdm
systemctl enable ups-monitor

echo ""
echo "======================================"
echo " Setup complete!"
echo "======================================"
echo ""
echo " Opens on boot: $KIOSK_URL"
echo " Running as:    $KIOSK_USER"
echo ""
echo " Reboot now:  sudo reboot"
echo ""
