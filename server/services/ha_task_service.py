"""
Home Assistant To-Do list integration.

Uses the HA REST API and todo.* services to read and manage todo lists.
Falls back to empty lists gracefully when HA is unreachable.
"""
import logging
import requests
from config import HA_URL, HA_TOKEN

logger = logging.getLogger(__name__)

_TIMEOUT = 5  # seconds


def _headers():
    return {
        'Authorization': f'Bearer {HA_TOKEN}',
        'Content-Type': 'application/json',
    }


def is_configured():
    return bool(HA_URL and HA_TOKEN)


# ── Lists ─────────────────────────────────────────────────────────────────────

def get_lists():
    """Return all todo.* entities as list objects."""
    if not is_configured():
        return []
    try:
        r = requests.get(f'{HA_URL}/api/states', headers=_headers(), timeout=_TIMEOUT)
        r.raise_for_status()
        entities = r.json()
        lists = []
        for e in entities:
            if not e['entity_id'].startswith('todo.'):
                continue
            attr = e.get('attributes', {})
            name = attr.get('friendly_name') or e['entity_id'].replace('todo.', '').replace('_', ' ').title()
            total = attr.get('total_items', 0)
            pending = e.get('state', '0')
            try:
                pending = int(pending)
            except (ValueError, TypeError):
                pending = 0
            lists.append({
                'id': e['entity_id'],       # use entity_id as list "id"
                'name': name,
                'color': _color_for(e['entity_id']),
                'total': total,
                'pending': pending,
            })
        return sorted(lists, key=lambda x: x['name'])
    except Exception as e:
        logger.warning(f'HA get_lists failed: {e}')
        return []


def _color_for(entity_id):
    """Deterministic color based on entity_id string."""
    colors = ['#ff6b6b', '#ffd166', '#06d6a0', '#4ecdc4', '#45b7d1', '#a29bfe', '#fd79a8', '#e17055']
    return colors[hash(entity_id) % len(colors)]


# ── List management ───────────────────────────────────────────────────────────

def create_list(name):
    """Create a new local_todo list in HA via config flow."""
    if not is_configured():
        return None
    try:
        r = requests.post(
            f'{HA_URL}/api/config/config_entries/flow',
            headers=_headers(),
            json={'handler': 'local_todo'},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        flow_id = data.get('flow_id')
        if not flow_id or data.get('type') != 'form':
            return None
        r2 = requests.post(
            f'{HA_URL}/api/config/config_entries/flow/{flow_id}',
            headers=_headers(),
            json={'todo_list_name': name},
            timeout=_TIMEOUT,
        )
        r2.raise_for_status()
        result = r2.json()
        if result.get('type') == 'create_entry':
            # Derive the expected entity_id from the name
            entity_id = 'todo.' + name.lower().replace(' ', '_')
            return {
                'id': entity_id,
                'name': name,
                'color': _color_for(entity_id),
                'total': 0,
                'pending': 0,
            }
        return None
    except Exception as e:
        logger.warning(f'HA create_list failed: {e}')
        return None


def delete_list(entity_id):
    """Remove a local_todo list from HA by deleting its config entry."""
    if not is_configured():
        return False
    try:
        # Find the config entry ID for this entity
        r = requests.get(f'{HA_URL}/api/config/config_entries/entry', headers=_headers(), timeout=_TIMEOUT)
        r.raise_for_status()
        entry_id = None
        entity_name = entity_id.replace('todo.', '')  # e.g. 'shopping_list'
        for entry in r.json():
            if entry.get('domain') != 'local_todo':
                continue
            title_slug = entry.get('title', '').lower().replace(' ', '_')
            if title_slug == entity_name:
                entry_id = entry['entry_id']
                break
        if not entry_id:
            logger.warning(f'No config entry found for {entity_id}')
            return False
        r2 = requests.delete(
            f'{HA_URL}/api/config/config_entries/entry/{entry_id}',
            headers=_headers(),
            timeout=_TIMEOUT,
        )
        r2.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f'HA delete_list failed: {e}')
        return False


# ── Items ─────────────────────────────────────────────────────────────────────

def get_tasks(entity_id, include_completed=True):
    """Fetch todo items for a given entity_id."""
    if not is_configured():
        return []
    payload = {'entity_id': entity_id}
    if not include_completed:
        payload['status'] = ['needs_action']
    try:
        r = requests.post(
            f'{HA_URL}/api/services/todo/get_items?return_response',
            headers=_headers(),
            json=payload,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        # HA returns {service_response: {entity_id: {items: [...]}}}
        data = r.json()
        entity_data = data.get('service_response', data)
        items = []
        for eid, result in entity_data.items():
            for item in result.get('items', []):
                completed = item.get('status', 'needs_action') == 'completed'
                items.append({
                    'id': item.get('uid', item.get('summary', '')),
                    'list_id': entity_id,
                    'title': item.get('summary', ''),
                    'completed': completed,
                    'due_date': item.get('due'),
                    'description': item.get('description', ''),
                })
        # Pending first, then completed
        items.sort(key=lambda x: (x['completed'], x['title'].lower()))
        return items
    except Exception as e:
        logger.warning(f'HA get_tasks({entity_id}) failed: {e}')
        return []


def create_task(entity_id, title, due_date=None):
    """Add a new item to a todo list."""
    if not is_configured():
        return None
    payload = {'entity_id': entity_id, 'item': title}
    if due_date:
        payload['due_date'] = due_date
    try:
        r = requests.post(
            f'{HA_URL}/api/services/todo/add_item',
            headers=_headers(),
            json=payload,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        # HA doesn't return the created item — synthesize one
        return {
            'id': title,         # HA doesn't give us a uid on creation
            'list_id': entity_id,
            'title': title,
            'completed': False,
            'due_date': due_date,
        }
    except Exception as e:
        logger.warning(f'HA create_task failed: {e}')
        return None


def toggle_task(entity_id, item_uid, current_completed):
    """Toggle a task's completion status."""
    if not is_configured():
        return None
    new_status = 'needs_action' if current_completed else 'completed'
    try:
        r = requests.post(
            f'{HA_URL}/api/services/todo/update_item',
            headers=_headers(),
            json={'entity_id': entity_id, 'item': item_uid, 'status': new_status},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        return {'completed': not current_completed}
    except Exception as e:
        logger.warning(f'HA toggle_task failed: {e}')
        return None


def delete_task(entity_id, item_uid):
    """Remove an item from a todo list."""
    if not is_configured():
        return False
    try:
        r = requests.post(
            f'{HA_URL}/api/services/todo/remove_item',
            headers=_headers(),
            json={'entity_id': entity_id, 'item': item_uid},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f'HA delete_task failed: {e}')
        return False
