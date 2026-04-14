#!/usr/bin/env python3
"""
UPS Monitor daemon for RPi UPSPack Standard V3P.

Reads battery data from /dev/ttyS5 (UART5, pins 11/13) at 9600 baud.
Exposes JSON at http://localhost:7070/ups
Exposes reboot trigger at http://localhost:7070/reboot

Data format from V3P (actual hardware output):
  $ SmartUPS V3.2P,Vin GOOD,BATCAP 87,Vout 5250 $
  $ SmartUPS V3.2P,Vin NG,BATCAP 55,Vout 5250 $

Note: V3P sends "NG" for no external power; normalised to "BAD" for the UI.
"""

import json
import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import serial

SERIAL_PORT    = "/dev/ttyS5"
SERIAL_BAUD    = 9600
HTTP_HOST      = "0.0.0.0"   # accept from NAS as well as localhost
HTTP_PORT      = 7070
SHUTDOWN_PCT   = 5            # shut down when battery <= this with no AC power

# V3P sends "NG" (no good) when AC is absent; normalise to "BAD" for the UI.
# Pattern accepts GOOD, BAD, or NG.
# Use \$\s+ (one-or-more spaces) and require model to start with a letter so
# the end-of-packet "$" is never confused with the start-of-packet "$".
UPS_PATTERN = re.compile(
    r"\$\s+([A-Za-z][^,]+),Vin\s+(GOOD|BAD|NG),BATCAP\s+(\d+),Vout\s+(\d+)"
)

# Shared state updated by the serial reader thread
_state_lock = threading.Lock()
_state = {
    "model": None,
    "vin": None,
    "battery_pct": None,
    "vout_mv": None,
    "last_update": None,
    "parse_errors": 0,
    "raw_last": None,
}


def _normalise_vin(raw: str) -> str:
    """Map hardware 'NG' to 'BAD' so the UI only sees GOOD/BAD."""
    return "BAD" if raw.upper() == "NG" else raw.upper()


def serial_reader():
    """Background thread: read V3P serial output and update shared state."""
    while True:
        try:
            with serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=5) as ser:
                buf = b""
                while True:
                    chunk = ser.read(128)
                    if not chunk:
                        continue
                    buf += chunk
                    if len(buf) > 1024:
                        buf = buf[-512:]
                    text = buf.decode("ascii", errors="replace")
                    m = UPS_PATTERN.search(text)
                    if m:
                        buf = b""
                        vin = _normalise_vin(m.group(2))
                        pct = int(m.group(3))
                        with _state_lock:
                            _state["model"]       = m.group(1).strip()
                            _state["vin"]         = vin
                            _state["battery_pct"] = pct
                            _state["vout_mv"]     = int(m.group(4))
                            _state["last_update"] = time.time()
                            _state["raw_last"]    = text.strip().split("\n")[-1]
                        # Shutdown when on battery and critically low
                        if vin == "BAD" and pct <= SHUTDOWN_PCT:
                            subprocess.run(["shutdown", "-h", "now"])
                    else:
                        # Partial packet — keep buffering; only count errors after timeout
                        if len(text) > 200 and "$" not in text:
                            with _state_lock:
                                _state["parse_errors"] += 1
                                _state["raw_last"] = text.strip()[-120:]
                            buf = b""
        except serial.SerialException as e:
            with _state_lock:
                _state["raw_last"] = f"serial error: {e}"
            time.sleep(5)
        except Exception as e:
            with _state_lock:
                _state["raw_last"] = f"error: {e}"
            time.sleep(5)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # Suppress default access log noise

    def do_GET(self):
        if self.path == "/ups":
            self._serve_ups()
        elif self.path == "/reboot":
            self._serve_reboot()
        else:
            self.send_response(404)
            self.end_headers()

    def _serve_ups(self):
        with _state_lock:
            data = dict(_state)

        age = None
        if data["last_update"] is not None:
            age = round(time.time() - data["last_update"], 1)

        body = json.dumps(
            {
                "model": data["model"],
                "vin": data["vin"],
                "battery_pct": data["battery_pct"],
                "vout_mv": data["vout_mv"],
                "data_age_seconds": age,
                "parse_errors": data["parse_errors"],
                "raw_last": data["raw_last"],
            }
        ).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_reboot(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"rebooting\n")
        threading.Thread(
            target=lambda: (time.sleep(1), subprocess.run(["reboot"])),
            daemon=True,
        ).start()


if __name__ == "__main__":
    t = threading.Thread(target=serial_reader, daemon=True)
    t.start()

    server = HTTPServer((HTTP_HOST, HTTP_PORT), Handler)
    print(f"UPS monitor listening on http://{HTTP_HOST}:{HTTP_PORT}")
    server.serve_forever()
