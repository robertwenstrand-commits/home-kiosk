import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'data', 'kiosk.db')
HA_URL = os.getenv('HA_URL', '').rstrip('/')
HA_TOKEN = os.getenv('HA_TOKEN', '')
WYZE_RTSP_URL = os.getenv('WYZE_RTSP_URL', '')
GOOGLE_CALENDAR_IDS = [c.strip() for c in os.getenv('GOOGLE_CALENDAR_IDS', 'primary').split(',')]
CALENDAR_SYNC_INTERVAL = int(os.getenv('CALENDAR_SYNC_INTERVAL', '900'))
HOST = os.getenv('HOST', '127.0.0.1')
PORT = int(os.getenv('PORT', '5000'))
DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
GOOGLE_CREDENTIALS_FILE = os.getenv('GOOGLE_CREDENTIALS_FILE', 'credentials.json')
TOKEN_FILE = os.path.join(os.path.dirname(__file__), 'data', 'token.pickle')
APP_TITLE = os.getenv('APP_TITLE', 'Home')
