from flask import Flask, jsonify, request, render_template, Response, abort
from flask_cors import CORS
import logging
import threading
import time as _time
import urllib.request as _urllib_req
import json as _json

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
    if not ok:
        return jsonify({'error': 'failed to delete list'}), 502
    return jsonify({'ok': True})


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


@app.route('/api/tasks/update', methods=['POST'])
def api_update_task():
    data = request.get_json(force=True)
    entity_id = data.get('entity_id', '').strip()
    item_uid  = data.get('item_uid', '').strip()
    title     = (data.get('title') or '').strip()
    if not entity_id or not item_uid or not title:
        return jsonify({'error': 'entity_id, item_uid, and title required'}), 400
    result = ha_tasks.update_task(
        entity_id, item_uid, title,
        due_date=data.get('due_date') or None,
        description=data.get('description') or None,
    )
    if result is None:
        return jsonify({'error': 'failed to update task'}), 502
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


# ── Home Assistant helpers ─────────────────────────────────────────────────────

def _ha_call(method, path, data=None):
    if not config.HA_URL or not config.HA_TOKEN:
        return None
    url = config.HA_URL + path
    body = _json.dumps(data).encode() if data is not None else None
    req = _urllib_req.Request(url, data=body, method=method)
    req.add_header('Authorization', f'Bearer {config.HA_TOKEN}')
    req.add_header('Content-Type', 'application/json')
    try:
        with _urllib_req.urlopen(req, timeout=5) as resp:
            return _json.loads(resp.read())
    except Exception as e:
        logger.error(f'HA call failed: {e}')
        return None


def _ha_state(entity_id):
    """Return entity state string or 'unknown' on any failure."""
    result = _ha_call('GET', f'/api/states/{entity_id}')
    return result.get('state', 'unknown') if result else 'unknown'


def _ha_states_map(entity_ids):
    """Fetch all HA states in one call and return a dict keyed by entity_id."""
    all_states = _ha_call('GET', '/api/states')
    if not all_states:
        return {}
    wanted = set(entity_ids)
    return {s['entity_id']: s for s in all_states if s['entity_id'] in wanted}


# ── Garage Lock API ────────────────────────────────────────────────────────────

GARAGE_LOCK_ENTITY = 'lock.garage_door'


@app.route('/api/garage/status')
def api_garage_status():
    return jsonify({'state': _ha_state(GARAGE_LOCK_ENTITY)})


@app.route('/api/garage/lock', methods=['POST'])
def api_garage_lock():
    data = request.get_json(force=True)
    service = 'lock' if data.get('lock') else 'unlock'
    result = _ha_call('POST', f'/api/services/lock/{service}', {'entity_id': GARAGE_LOCK_ENTITY})
    if result is None:
        return jsonify({'error': 'failed'}), 502
    return jsonify({'ok': True})


# ── Gate API ───────────────────────────────────────────────────────────────────

GATE_ENTITY = 'cover.garage_door_door_1'
GATE_HOLD_INTERVAL = 8  # seconds between auto-opens during hold

# Server-side hold-open state
_gate_hold = {'active': False, 'end_time': 0.0}
_gate_hold_lock = threading.Lock()
_gate_hold_thread = None


def _gate_hold_worker():
    """Background thread: opens gate every GATE_HOLD_INTERVAL seconds."""
    global _gate_hold_thread
    last_open = _time.time()
    while True:
        _time.sleep(1)
        with _gate_hold_lock:
            if not _gate_hold['active'] or _time.time() >= _gate_hold['end_time']:
                _gate_hold['active'] = False
                _gate_hold_thread = None
                logger.info('Gate hold-open ended')
                return
        if _time.time() - last_open >= GATE_HOLD_INTERVAL:
            logger.info('Gate hold: triggering open')
            _ha_call('POST', '/api/services/cover/open_cover', {'entity_id': GATE_ENTITY})
            last_open = _time.time()


@app.route('/api/gate/status')
def api_gate_status():
    state = _ha_state(GATE_ENTITY)
    now = _time.time()
    with _gate_hold_lock:
        active = _gate_hold['active'] and now < _gate_hold['end_time']
        remaining = int(max(0, _gate_hold['end_time'] - now)) if active else 0
    return jsonify({'state': state, 'hold_active': active, 'hold_remaining': remaining})


@app.route('/api/gate/open', methods=['POST'])
def api_gate_open():
    result = _ha_call('POST', '/api/services/cover/open_cover',
                      {'entity_id': GATE_ENTITY})
    if result is None:
        return jsonify({'error': 'failed to trigger gate'}), 502
    return jsonify({'ok': True})


@app.route('/api/gate/hold', methods=['POST'])
def api_gate_hold_start():
    global _gate_hold_thread
    data = request.get_json(force=True)
    minutes = max(1, min(480, int(data.get('minutes', 5))))
    end_time = _time.time() + minutes * 60
    with _gate_hold_lock:
        _gate_hold['active'] = True
        _gate_hold['end_time'] = end_time
    if _gate_hold_thread is None or not _gate_hold_thread.is_alive():
        _gate_hold_thread = threading.Thread(target=_gate_hold_worker, daemon=True)
        _gate_hold_thread.start()
    # Open immediately
    _ha_call('POST', '/api/services/cover/open_cover', {'entity_id': GATE_ENTITY})
    logger.info(f'Gate hold-open started for {minutes} min')
    return jsonify({'ok': True, 'end_time': end_time, 'minutes': minutes})


@app.route('/api/gate/hold', methods=['DELETE'])
def api_gate_hold_cancel():
    with _gate_hold_lock:
        _gate_hold['active'] = False
        _gate_hold['end_time'] = 0.0
    logger.info('Gate hold-open cancelled')
    return jsonify({'ok': True})


# ── Lights & Switches API ──────────────────────────────────────────────────────

DASHBOARD_LIGHTS = [
    {'entity_id': 'switch.back_yard',   'name': 'Back Yard',    'icon': '🌿'},
    {'entity_id': 'switch.living_room', 'name': 'Living Room',  'icon': '🛋️'},
    {'entity_id': 'switch.game_room',   'name': 'Game Room',    'icon': '🎮'},
    {'entity_id': 'light.game_lounge',  'name': 'Game Lounge',  'icon': '💡'},
]
_DASHBOARD_LIGHT_IDS = {item['entity_id'] for item in DASHBOARD_LIGHTS}


@app.route('/api/lights')
def api_lights():
    states = _ha_states_map(_DASHBOARD_LIGHT_IDS)
    return jsonify([
        {
            'entity_id': item['entity_id'],
            'name': item['name'],
            'icon': item['icon'],
            'domain': item['entity_id'].split('.')[0],
            'state': (states.get(item['entity_id']) or {}).get('state', 'unknown'),
        }
        for item in DASHBOARD_LIGHTS
    ])


@app.route('/api/lights/toggle', methods=['POST'])
def api_lights_toggle():
    data = request.get_json(force=True)
    entity_id = data.get('entity_id', '')
    if entity_id not in _DASHBOARD_LIGHT_IDS:
        return jsonify({'error': 'unknown entity'}), 400
    domain = entity_id.split('.')[0]
    service = 'turn_on' if data.get('on') else 'turn_off'
    result = _ha_call('POST', f'/api/services/{domain}/{service}', {'entity_id': entity_id})
    if result is None:
        return jsonify({'error': 'failed'}), 502
    return jsonify({'ok': True})


# ── Home Stats API ─────────────────────────────────────────────────────────────

_HOME_STAT_ENTITIES = {
    'pw_remaining': 'sensor.tesla_powerwall_2_battery_remaining',
    'pw_capacity':  'sensor.tesla_powerwall_2_battery_capacity',
    'pw_power':     'sensor.tesla_powerwall_2_power',
    'cat_litter':   'sensor.catbox_prime_litter_level',
    'cat_drawer':   'sensor.catbox_prime_waste_drawer',
    'cat_status':   'sensor.catbox_prime_status_code',
}


@app.route('/api/home-stats')
def api_home_stats():
    states = _ha_states_map(_HOME_STAT_ENTITIES.values())

    def fval(key, default=0.0):
        raw = (states.get(_HOME_STAT_ENTITIES[key]) or {}).get('state', default)
        try:
            return float(raw)
        except (ValueError, TypeError):
            return float(default)

    def sval(key, default='unknown'):
        return (states.get(_HOME_STAT_ENTITIES[key]) or {}).get('state') or default

    pw_remaining = fval('pw_remaining')
    pw_capacity  = fval('pw_capacity', 13.5)
    pw_pct       = round(pw_remaining / pw_capacity * 100) if pw_capacity > 0 else 0

    return jsonify({
        'powerwall': {
            'pct':     min(100, max(0, pw_pct)),
            'kwh':     round(pw_remaining, 1),
            'power_w': fval('pw_power'),
        },
        'catbox': {
            'litter_pct': round(fval('cat_litter')),
            'waste_pct':  round(fval('cat_drawer')),
            'status':     sval('cat_status'),
        },
    })


# ── Pool API ───────────────────────────────────────────────────────────────────

POOL_ENTITIES = {
    'pool_pump':     'switch.pool_pump',
    'pool_heater':   'switch.pool_heater',
    'pool_temp':     'sensor.pool_temp',
    'pool_setpoint': 'climate.pool_set_point_pool',
    'spa_pump':      'switch.spa_pump',
    'spa_heater':    'switch.spa_heater',
    'spa_temp':      'sensor.spa_temp',
    'spa_setpoint':  'climate.spa_set_point_spa',
    'salinity':      'sensor.pool_salinity',
    'spa_salinity':  'sensor.spa_salinity',
    'cover':         'sensor.cover_pool',
    'light':         'light.light',
    'spillover':     'switch.spillover',
    'waterfall':     'switch.waterfall',
    'air_temp':      'sensor.air_temp',
    'ph':            'sensor.ph',
    'orp':           'sensor.orp',
}

_POOL_ALLOWED_SWITCHES = {v for k, v in POOL_ENTITIES.items() if v.startswith('switch.')}
_POOL_ALLOWED_CLIMATES = {v for k, v in POOL_ENTITIES.items() if v.startswith('climate.')}


@app.route('/api/pool/status')
def api_pool_status():
    states = _ha_states_map(POOL_ENTITIES.values())
    return jsonify({
        key: {
            'state': (states.get(entity_id) or {}).get('state', 'unknown'),
            'attributes': (states.get(entity_id) or {}).get('attributes', {}),
        }
        for key, entity_id in POOL_ENTITIES.items()
    })


@app.route('/api/pool/switch', methods=['POST'])
def api_pool_switch():
    data = request.get_json(force=True)
    entity_id = data.get('entity_id', '')
    if entity_id not in _POOL_ALLOWED_SWITCHES:
        return jsonify({'error': 'unknown entity'}), 400
    service = 'turn_on' if data.get('on') else 'turn_off'
    result = _ha_call('POST', f'/api/services/switch/{service}', {'entity_id': entity_id})
    if result is None:
        return jsonify({'error': 'failed'}), 502
    return jsonify({'ok': True})


@app.route('/api/pool/setpoint', methods=['POST'])
def api_pool_setpoint():
    data = request.get_json(force=True)
    entity_id = data.get('entity_id', '')
    if entity_id not in _POOL_ALLOWED_CLIMATES:
        return jsonify({'error': 'unknown entity'}), 400
    if 'temperature' in data:
        r = _ha_call('POST', '/api/services/climate/set_temperature',
                     {'entity_id': entity_id, 'temperature': float(data['temperature'])})
        if r is None:
            return jsonify({'error': 'failed to set temperature'}), 502
    if 'mode' in data:
        r = _ha_call('POST', '/api/services/climate/set_hvac_mode',
                     {'entity_id': entity_id, 'hvac_mode': data['mode']})
        if r is None:
            return jsonify({'error': 'failed to set mode'}), 502
    return jsonify({'ok': True})


@app.route('/api/pool/light', methods=['POST'])
def api_pool_light():
    data = request.get_json(force=True)
    entity_id = POOL_ENTITIES['light']
    if 'effect' in data:
        r = _ha_call('POST', '/api/services/light/turn_on',
                     {'entity_id': entity_id, 'effect': data['effect']})
    elif data.get('on'):
        r = _ha_call('POST', '/api/services/light/turn_on', {'entity_id': entity_id})
    else:
        r = _ha_call('POST', '/api/services/light/turn_off', {'entity_id': entity_id})
    if r is None:
        return jsonify({'error': 'failed'}), 502
    return jsonify({'ok': True})


# ── System API ─────────────────────────────────────────────────────────────────

@app.route('/api/status')
def api_status():
    raw = _ha_state(POOL_ENTITIES['air_temp'])
    air_temp = raw if raw not in ('unknown', 'unavailable') else None
    return jsonify({
        'title': config.APP_TITLE,
        'camera_enabled': camera_svc.is_configured(),
        'calendar_enabled': calendar_svc.has_credentials(),
        'last_calendar_sync': calendar_svc.get_last_sync(),
        'air_temp': air_temp,
    })


if __name__ == '__main__':
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, threaded=True)
