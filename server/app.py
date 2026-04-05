from flask import Flask, jsonify, request, render_template, Response, abort
from flask_cors import CORS
import logging

import config
import services.ha_task_service as ha_tasks
import services.calendar_service as calendar_svc
import services.camera_service as camera_svc

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


# ── Bootstrap ────────────────────────────────────────────────────────────────

def _init():
    calendar_svc.init_calendar_db()
    if calendar_svc.has_credentials():
        calendar_svc.start_background_sync()
    else:
        logger.info("No Google Calendar credentials found. Run google_auth.py to set up.")
    if ha_tasks.is_configured():
        logger.info(f"Home Assistant tasks: {config.HA_URL}")
    else:
        logger.info("No Home Assistant config found. Set HA_URL and HA_TOKEN in .env")

_init()


# ── Main SPA ─────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Task Lists API (Home Assistant To-Do) ─────────────────────────────────────

@app.route('/api/lists', methods=['GET'])
def api_get_lists():
    return jsonify(ha_tasks.get_lists())


@app.route('/api/lists', methods=['POST'])
def api_create_list():
    data = request.get_json(force=True)
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name required'}), 400
    lst = ha_tasks.create_list(name)
    if not lst:
        return jsonify({'error': 'failed to create list in Home Assistant'}), 502
    return jsonify(lst), 201


@app.route('/api/lists/<path:list_id>', methods=['DELETE'])
def api_delete_list(list_id):
    ok = ha_tasks.delete_list(list_id)
    return jsonify({'ok': ok})


# ── Tasks API ─────────────────────────────────────────────────────────────────
# list_id is the HA entity_id (e.g. "todo.shopping"), URL-encoded by the client.

@app.route('/api/lists/<path:list_id>/tasks', methods=['GET'])
def api_get_tasks(list_id):
    include_done = request.args.get('completed', 'true').lower() == 'true'
    return jsonify(ha_tasks.get_tasks(list_id, include_done))


@app.route('/api/lists/<path:list_id>/tasks', methods=['POST'])
def api_create_task(list_id):
    data = request.get_json(force=True)
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title required'}), 400
    task = ha_tasks.create_task(list_id, title, data.get('due_date'))
    if not task:
        return jsonify({'error': 'failed to create task'}), 502
    return jsonify(task), 201


@app.route('/api/tasks/toggle', methods=['POST'])
def api_toggle_task():
    data = request.get_json(force=True)
    entity_id = data.get('entity_id', '')
    item_uid = data.get('item_uid', '')
    current_completed = bool(data.get('completed', False))
    if not entity_id or not item_uid:
        return jsonify({'error': 'entity_id and item_uid required'}), 400
    result = ha_tasks.toggle_task(entity_id, item_uid, current_completed)
    if result is None:
        return jsonify({'error': 'failed'}), 502
    return jsonify(result)


@app.route('/api/tasks/delete', methods=['POST'])
def api_delete_task():
    data = request.get_json(force=True)
    entity_id = data.get('entity_id', '')
    item_uid = data.get('item_uid', '')
    if not entity_id or not item_uid:
        return jsonify({'error': 'entity_id and item_uid required'}), 400
    ok = ha_tasks.delete_task(entity_id, item_uid)
    return jsonify({'ok': ok})


# ── Calendar API ───────────────────────────────────────────────────────────────

@app.route('/api/calendar/events')
def api_calendar_events():
    start = request.args.get('start', '')
    end = request.args.get('end', '')
    if not start or not end:
        return jsonify({'error': 'start and end required'}), 400
    events = calendar_svc.get_events_for_range(start, end)
    return jsonify({
        'events': events,
        'last_sync': calendar_svc.get_last_sync(),
        'has_credentials': calendar_svc.has_credentials(),
    })


@app.route('/api/calendar/today')
def api_today_events():
    return jsonify({
        'events': calendar_svc.get_today_events(),
        'last_sync': calendar_svc.get_last_sync(),
        'has_credentials': calendar_svc.has_credentials(),
    })


@app.route('/api/calendar/sync', methods=['POST'])
def api_force_sync():
    if not calendar_svc.has_credentials():
        return jsonify({'error': 'No credentials. Run google_auth.py first.'}), 400
    ok = calendar_svc.sync_calendars()
    return jsonify({'ok': ok, 'last_sync': calendar_svc.get_last_sync()})


# ── Camera API ─────────────────────────────────────────────────────────────────

@app.route('/api/camera/status')
def api_camera_status():
    return jsonify({
        'configured': camera_svc.is_configured(),
        'ffmpeg': camera_svc.check_ffmpeg(),
    })


@app.route('/api/camera/stream')
def api_camera_stream():
    if not camera_svc.is_configured():
        abort(404)
    return Response(
        camera_svc.generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame',
        headers={
            'Cache-Control': 'no-cache, no-store',
            'Connection': 'keep-alive',
        }
    )


# ── System API ─────────────────────────────────────────────────────────────────

@app.route('/api/status')
def api_status():
    return jsonify({
        'title': config.APP_TITLE,
        'camera_enabled': camera_svc.is_configured(),
        'calendar_enabled': calendar_svc.has_credentials(),
        'last_calendar_sync': calendar_svc.get_last_sync(),
    })


if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, threaded=True)
