import sqlite3
import pickle
import os
import threading
import logging
from datetime import datetime, timedelta, timezone

from config import DATABASE_PATH, GOOGLE_CALENDAR_IDS, CALENDAR_SYNC_INTERVAL, TOKEN_FILE

logger = logging.getLogger(__name__)

_sync_timer = None
_sync_lock = threading.Lock()


def init_calendar_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS calendar_events (
            id          TEXT PRIMARY KEY,
            calendar_id TEXT NOT NULL,
            title       TEXT NOT NULL,
            start_time  TEXT,
            end_time    TEXT,
            all_day     INTEGER NOT NULL DEFAULT 0,
            description TEXT,
            location    TEXT,
            color       TEXT DEFAULT '#4285f4',
            synced_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_cal_start ON calendar_events(start_time);

        CREATE TABLE IF NOT EXISTS calendar_meta (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
    """)
    conn.commit()
    conn.close()


def _get_service():
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        if not os.path.exists(TOKEN_FILE):
            return None

        with open(TOKEN_FILE, 'rb') as f:
            creds = pickle.load(f)

        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, 'wb') as f:
                pickle.dump(creds, f)

        if not creds or not creds.valid:
            return None

        return build('calendar', 'v3', credentials=creds, cache_discovery=False)
    except Exception as e:
        logger.warning(f"Could not get calendar service: {e}")
        return None


def sync_calendars():
    """Fetch events for the next 60 days from Google and cache locally."""
    with _sync_lock:
        service = _get_service()
        if not service:
            logger.info("Calendar: no credentials, skipping sync")
            return False

        now = datetime.now(timezone.utc)
        time_min = now.isoformat()
        time_max = (now + timedelta(days=60)).isoformat()

        # Calendar color map
        cal_colors = {}
        try:
            cal_list = service.calendarList().list().execute()
            for item in cal_list.get('items', []):
                bg = item.get('backgroundColor') or item.get('colorId', '#4285f4')
                cal_colors[item['id']] = bg
        except Exception:
            pass

        events_to_upsert = []
        for cal_id in GOOGLE_CALENDAR_IDS:
            try:
                page_token = None
                while True:
                    result = service.events().list(
                        calendarId=cal_id,
                        timeMin=time_min,
                        timeMax=time_max,
                        singleEvents=True,
                        orderBy='startTime',
                        pageToken=page_token,
                        maxResults=250,
                    ).execute()
                    for event in result.get('items', []):
                        start = event['start']
                        end = event['end']
                        all_day = 'date' in start and 'dateTime' not in start
                        events_to_upsert.append((
                            event['id'],
                            cal_id,
                            event.get('summary', '(No title)'),
                            start.get('dateTime') or start.get('date'),
                            end.get('dateTime') or end.get('date'),
                            1 if all_day else 0,
                            event.get('description', ''),
                            event.get('location', ''),
                            cal_colors.get(cal_id, '#4285f4'),
                        ))
                    page_token = result.get('nextPageToken')
                    if not page_token:
                        break
            except Exception as e:
                logger.warning(f"Failed to sync calendar {cal_id}: {e}")

        conn = sqlite3.connect(DATABASE_PATH)
        conn.execute("DELETE FROM calendar_events WHERE start_time < ?", (time_min,))
        conn.executemany("""
            INSERT OR REPLACE INTO calendar_events
              (id, calendar_id, title, start_time, end_time, all_day, description, location, color, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, events_to_upsert)
        conn.execute("INSERT OR REPLACE INTO calendar_meta(key,value) VALUES('last_sync', datetime('now'))")
        conn.commit()
        conn.close()
        logger.info(f"Calendar synced: {len(events_to_upsert)} events")
        return True


def get_events_for_range(start_date_str, end_date_str):
    """Return events between two ISO date strings (YYYY-MM-DD)."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT * FROM calendar_events
        WHERE date(start_time) >= ? AND date(start_time) <= ?
        ORDER BY all_day DESC, start_time
    """, (start_date_str, end_date_str)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_today_events():
    today = datetime.now().date().isoformat()
    return get_events_for_range(today, today)


def get_last_sync():
    conn = sqlite3.connect(DATABASE_PATH)
    row = conn.execute("SELECT value FROM calendar_meta WHERE key='last_sync'").fetchone()
    conn.close()
    return row[0] if row else None


def has_credentials():
    return os.path.exists(TOKEN_FILE)


def start_background_sync():
    """Schedule periodic background calendar sync."""
    global _sync_timer

    def _run():
        global _sync_timer
        try:
            sync_calendars()
        except Exception as e:
            logger.error(f"Background sync error: {e}")
        _sync_timer = threading.Timer(CALENDAR_SYNC_INTERVAL, _run)
        _sync_timer.daemon = True
        _sync_timer.start()

    t = threading.Timer(5, _run)  # First sync 5s after startup
    t.daemon = True
    t.start()
