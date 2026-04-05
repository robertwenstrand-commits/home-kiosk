"""
Run this script ONCE on a machine with a browser to authorize Google Calendar access.
It will produce a token.pickle file. Copy that file to the Pi's data/ directory.

Usage:
    pip install google-auth-oauthlib google-api-python-client
    python google_auth.py
"""
import os
import pickle

SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def main():
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    creds_file = os.getenv('GOOGLE_CREDENTIALS_FILE', 'credentials.json')
    token_file = os.path.join('data', 'token.pickle')
    os.makedirs('data', exist_ok=True)

    if not os.path.exists(creds_file):
        print(f"\nERROR: '{creds_file}' not found.")
        print("\nSteps to get credentials.json:")
        print("  1. Go to console.cloud.google.com")
        print("  2. Create a project → Enable Google Calendar API")
        print("  3. Create OAuth 2.0 Desktop credentials")
        print("  4. Download JSON → save as credentials.json in this folder")
        print("  5. Re-run this script\n")
        return

    flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(token_file, 'wb') as f:
        pickle.dump(creds, f)

    print(f"\nSuccess! Token saved to {token_file}")
    print("\nCopy this file to the Pi:")
    print(f"  scp {token_file} pi@<your-pi-ip>:~/kiosk/data/token.pickle\n")

    # Test it
    service = build('calendar', 'v3', credentials=creds)
    cal_list = service.calendarList().list().execute()
    print("Calendars found:")
    for cal in cal_list.get('items', []):
        print(f"  [{cal['id']}] {cal.get('summary', '(unnamed)')}")
    print("\nAdd the calendar IDs you want to GOOGLE_CALENDAR_IDS in your .env file.")


if __name__ == '__main__':
    main()
