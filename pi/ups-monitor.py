#!/usr/bin/env python3
"""
UPS Monitor daemon for RPi UPSPack Standard V3P.

Reads battery data from /dev/ttyS5 (UART5, pins 11/13) at 9600 baud.
Exposes JSON at http://localhost:7070/ups
Exposes reboot trigger at http://localhost:7070/reboot

Data format from V3P:
  $ <model>,Vin <GOOD|BAD>,BATCAP <pct>,Vout <mv> )

Example:
  $ SmartUPS V3.2P,Vin GOOD,BATCAP 87,Vout 5123 )
"""

import re
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import serial

SERIAL_PORT = "/dev/ttyS5"
SERIAL_BAUD = 9600
HTTP_HOST = "localhost"
HTTP_PORT = 7070

# Model name uses ([^,]+) not (\S+) because "SmartUPS V3.2P" contains a space
UPS_PATTERN = re.compile(
    r"\$\s+([^,]+),Vin\s+(GOOD|BAD),BATCAP\s+(\d+),Vout\s+(\d+)"
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


def serial_reader():
    """Background thread: read V3P serial output and update shared state."""
    while True:
        try:
            with serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=5) as ser:
                while True:
                    line = ser.readline().decode("ascii", errors="replace").strip()
                    if not line:
                        continue
                    m = UPS_PATTERN.search(line)
                    with _state_lock:
                        _state["raw_last"] = line
                        if m:
                            _state["model"] = m.group(1).strip()
                            _state["vin"] = m.group(2)
                            _state["battery_pct"] = int(m.group(3))
                            _state["vout_mv"] = int(m.group(4))
                            _state["last_update"] = time.time()
                        else:
                            _state["parse_errors"] += 1
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
        import json

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
