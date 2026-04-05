# Home Kiosk

A touchscreen home dashboard for Raspberry Pi Zero 2 — shows Home Assistant to-do lists, Google Calendar events, and a live Wyze camera feed.

## Structure

| Directory | Purpose |
|-----------|---------|
| `server/` | Flask backend — runs as a Docker container on your Synology NAS |
| `pi/`     | Pi Zero 2 kiosk setup — configures Chromium to load the server full-screen on boot |

## Quick Start

### 1. Deploy the server (Synology)

```bash
# On your Synology (SSH or Container Manager)
git clone https://github.com/robertwenstrand-commits/home-kiosk.git
cd home-kiosk/server
cp .env.example .env
nano .env          # fill in HA_URL, HA_TOKEN, and optional camera/calendar settings
docker compose up -d --build
```

The app will be available at `http://YOUR-SYNOLOGY-IP:5000`.

### 2. Set up the Pi (browser only)

```bash
chmod +x pi/setup_pi_kiosk.sh
sudo pi/setup_pi_kiosk.sh http://YOUR-SYNOLOGY-IP:5000
sudo reboot
```

## Configuration

Copy `server/.env.example` to `server/.env` and set:

| Variable | Description |
|----------|-------------|
| `HA_URL` | Home Assistant URL e.g. `http://192.168.1.41:8123` |
| `HA_TOKEN` | Long-lived access token from HA → Profile → Security |
| `WYZE_RTSP_URL` | Optional — `rtsp://user:pass@camera-ip/live` |
| `GOOGLE_CALENDAR_IDS` | Optional — comma-separated calendar IDs |

## Google Calendar Setup

Run once on a desktop machine with a browser:

```bash
cd server
pip install -r requirements.txt
python google_auth.py
# Then copy data/token.pickle to the Synology's server/data/ folder
```
