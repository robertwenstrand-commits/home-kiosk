/* ── API Helper ─────────────────────────────────────────────────────────── */
const API = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`PUT ${path} → ${r.status}`);
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE' });
    if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
    return r.json();
  },
};

/* ── Toast ──────────────────────────────────────────────────────────────── */
const Toast = {
  _timer: null,
  show(msg, duration = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove('show'), duration);
  },
};

/* ── Modal ──────────────────────────────────────────────────────────────── */
const Modal = {
  _resolve: null,

  open({ title, body, actions }) {
    document.getElementById('modal-title').textContent = title || '';
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-actions').innerHTML = '';

    if (typeof body === 'string') {
      document.getElementById('modal-body').innerHTML = body;
    } else if (body instanceof HTMLElement) {
      document.getElementById('modal-body').appendChild(body);
    }

    if (actions) {
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = a.class || 'btn-secondary';
        btn.textContent = a.label;
        btn.onclick = () => { this.close(); if (a.action) a.action(); };
        document.getElementById('modal-actions').appendChild(btn);
      });
    }

    document.getElementById('modal-overlay').classList.remove('hidden');

    // Auto-focus first input after animation
    setTimeout(() => {
      const inp = document.querySelector('#modal-body input, #modal-body textarea');
      if (inp) inp.focus();
    }, 100);
  },

  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  closeOnBackdrop(e) {
    if (e.target === document.getElementById('modal-overlay')) this.close();
  },

  prompt({ title, placeholder, hint, onConfirm, colors }) {
    const body = document.createElement('div');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'modal-input';
    inp.placeholder = placeholder || '';
    inp.setAttribute('autocomplete', 'off');
    body.appendChild(inp);

    let selectedColor = colors ? colors[0] : null;

    if (colors) {
      const row = document.createElement('div');
      row.className = 'color-picker-row';
      colors.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
        sw.style.background = c;
        sw.onclick = () => {
          selectedColor = c;
          row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
          sw.classList.add('selected');
        };
        row.appendChild(sw);
      });
      body.appendChild(row);
    }

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const val = inp.value.trim();
        if (val) { this.close(); onConfirm(val, selectedColor); }
      }
    });

    this.open({
      title,
      body,
      actions: [
        { label: 'Cancel', class: 'btn-secondary' },
        { label: 'Add', class: 'btn-primary', action: () => {
          const val = inp.value.trim();
          if (val) onConfirm(val, selectedColor);
        }},
      ],
    });
  },
};

/* ── App Router ─────────────────────────────────────────────────────────── */
const App = {
  current: 'dashboard',
  cameraEnabled: false,
  _order: ['dashboard', 'tasks', 'calendar'],

  enableCamera() {
    this.cameraEnabled = true;
    if (!this._order.includes('camera')) this._order.push('camera');
    document.getElementById('dash-camera').classList.remove('hidden');
    document.getElementById('screen-camera').classList.remove('hidden');
    document.getElementById('nav-camera').classList.remove('hidden');
    // Start camera preview image lazily — only load src when visible
    document.getElementById('dash-camera-img').src = '/api/camera/stream';
  },

  navigate(to) {
    if (to === this.current) return;

    const fromEl = document.getElementById('screen-' + this.current);
    const toEl   = document.getElementById('screen-' + to);
    if (!toEl) return;

    const fromIdx = this._order.indexOf(this.current);
    const toIdx   = this._order.indexOf(to);
    const goRight = toIdx > fromIdx;
    const EASING  = 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)';

    // Snap incoming screen to its off-screen start position with no transition
    toEl.style.transition = 'none';
    toEl.style.transform  = goRight ? 'translateX(100%)' : 'translateX(-100%)';
    fromEl.style.transition = 'none';

    // Force a synchronous reflow so the browser commits the snap before we start
    // the transition — this is more reliable than double-rAF in all environments
    void toEl.offsetHeight;

    // Now enable transitions and animate both screens simultaneously
    fromEl.style.transition = EASING;
    toEl.style.transition   = EASING;

    // Outgoing: slide left (parallax) when going forward, slide right when going back
    fromEl.style.transform = goRight ? 'translateX(-25%)' : 'translateX(100%)';
    // Incoming: slide to centre
    toEl.style.transform   = 'translateX(0)';

    fromEl.classList.remove('active');
    toEl.classList.add('active');

    // After animation, clear inline styles so CSS class rules take over cleanly.
    // This prevents the -25% parallax value from leaking into subsequent navigations.
    setTimeout(() => {
      fromEl.style.transition = '';
      fromEl.style.transform  = '';
      toEl.style.transition   = '';
      toEl.style.transform    = '';
    }, 320);

    // Update nav highlight
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === to);
    });

    this.current = to;
    this._onNavigate(to);
  },

  _onNavigate(screen) {
    if (screen === 'dashboard') DashUI.refresh();
    if (screen === 'tasks')     TasksUI.loadLists();
    if (screen === 'calendar')  CalUI.init();
    if (screen === 'camera')    CameraUI.start();
    if (screen !== 'camera')    CameraUI.stop();
  },

  async loadConfig() {
    try {
      const s = await API.get('/api/status');
      if (s.title) document.title = s.title;
      if (s.camera_enabled) this.enableCamera();
    } catch {
      // Offline or server not reachable — camera stays hidden
    }
  },
};

/* ── Dashboard UI ───────────────────────────────────────────────────────── */
const DashUI = {
  async refresh() {
    await Promise.all([this.loadEvents(), this.loadTasks()]);
  },

  async loadEvents() {
    const el = document.getElementById('dash-events-body');
    try {
      const data = await API.get('/api/calendar/today');
      el.innerHTML = '';
      if (!data.has_credentials) {
        el.innerHTML = '<div class="dash-no-events">Calendar not connected</div>';
        return;
      }
      if (!data.events.length) {
        el.innerHTML = '<div class="dash-no-events">No events today</div>';
        return;
      }
      const max = 4;
      data.events.slice(0, max).forEach(ev => {
        const d = document.createElement('div');
        d.className = 'dash-event';
        d.innerHTML = `
          <div class="event-dot" style="background:${ev.color || '#4ecdc4'}"></div>
          <div class="event-info">
            <div class="event-title">${esc(ev.title)}</div>
            <div class="event-time">${formatEventTime(ev)}</div>
          </div>`;
        el.appendChild(d);
      });
      if (data.events.length > max) {
        const more = document.createElement('div');
        more.className = 'dash-no-events';
        more.textContent = `+${data.events.length - max} more`;
        el.appendChild(more);
      }
    } catch {
      el.innerHTML = '<div class="dash-no-events">Offline</div>';
    }
  },

  async loadTasks() {
    const el = document.getElementById('dash-tasks-body');
    try {
      const lists = await API.get('/api/lists');
      el.innerHTML = '';
      if (!lists.length) {
        el.innerHTML = '<div class="dash-no-events">No lists</div>';
        return;
      }
      lists.slice(0, 4).forEach(lst => {
        const d = document.createElement('div');
        d.className = 'dash-list-row';
        d.innerHTML = `
          <div class="dash-list-dot" style="background:${lst.color}"></div>
          <div class="dash-list-name">${esc(lst.name)}</div>
          <div class="dash-list-count">${lst.pending || 0}</div>`;
        el.appendChild(d);
      });
    } catch {
      el.innerHTML = '<div class="dash-no-events">Offline</div>';
    }
  },
};

/* ── Tasks UI ───────────────────────────────────────────────────────────── */
const TasksUI = {
  _currentListId: null,
  _showCompleted: false,

  async loadLists() {
    const el = document.getElementById('task-lists-container');
    el.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    try {
      const lists = await API.get('/api/lists');
      el.innerHTML = '';
      if (!lists.length) {
        el.innerHTML = '<div class="dash-no-events" style="padding:20px 0">No lists yet. Tap + to add one.</div>';
        return;
      }
      lists.forEach(lst => {
        const card = document.createElement('div');
        card.className = 'list-card';
        // Tap → open; long-press → delete confirm
        addLongPress(card,
          () => this.openDetail(lst),
          () => this.confirmDeleteList(lst)
        );
        card.innerHTML = `
          <div class="list-card-header">
            <div class="list-color-dot" style="background:${lst.color}"></div>
            <div class="list-card-name">${esc(lst.name)}</div>
          </div>
          <div class="list-card-count" style="color:${lst.color}">${lst.pending || 0}</div>
          <div class="list-card-sub">${lst.pending || 0} pending · ${lst.total || 0} total</div>`;
        el.appendChild(card);
      });
    } catch (e) {
      el.innerHTML = '<div class="dash-no-events">Failed to load lists</div>';
    }
  },

  confirmDeleteList(lst) {
    Modal.open({
      title: `Delete "${lst.name}"?`,
      body: '<p style="color:var(--text-dim);font-size:14px">All tasks in this list will be permanently removed from Home Assistant.</p>',
      actions: [
        { label: 'Cancel', class: 'btn-secondary' },
        { label: 'Delete', class: 'btn-primary', action: async () => {
          try {
            await API.del(`/api/lists/${encodeURIComponent(lst.id)}`);
            Toast.show(`"${lst.name}" deleted`);
            this.loadLists();
          } catch {
            Toast.show('Failed to delete list');
          }
        }},
      ],
    });
  },

  openDetail(lst) {
    this._currentListId = lst.id;
    this._showCompleted = false;
    document.getElementById('detail-list-name').textContent = lst.name;
    document.getElementById('show-completed-cb').checked = false;
    document.getElementById('tasks-detail-view').classList.add('open');
    this.loadTasks();
  },

  closeDetail() {
    document.getElementById('tasks-detail-view').classList.remove('open');
    this._currentListId = null;
    this.loadLists(); // Refresh counts
  },

  async loadTasks() {
    if (!this._currentListId) return;
    const el = document.getElementById('task-items-container');
    el.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
    try {
      const encodedId = encodeURIComponent(this._currentListId);
      const tasks = await API.get(`/api/lists/${encodedId}/tasks?completed=${this._showCompleted}`);
      el.innerHTML = '';
      if (!tasks.length) {
        el.innerHTML = `<div class="dash-no-events" style="padding:20px 0">${this._showCompleted ? 'No tasks' : 'No pending tasks. Tap + to add one.'}</div>`;
        return;
      }
      tasks.forEach(t => el.appendChild(this._makeTaskEl(t)));
    } catch {
      el.innerHTML = '<div class="dash-no-events">Failed to load tasks</div>';
    }
  },

  _makeTaskEl(task) {
    const el = document.createElement('div');
    el.className = 'task-item' + (task.completed ? ' completed' : '');

    let dueHtml = '';
    if (task.due_date) {
      const due = new Date(task.due_date + 'T00:00:00');
      const today = new Date(); today.setHours(0,0,0,0);
      const overdue = !task.completed && due < today;
      dueHtml = `<div class="task-due${overdue ? ' overdue' : ''}">${formatDate(due)}</div>`;
    }

    el.innerHTML = `
      <div class="task-check">${task.completed ? '✓' : ''}</div>
      <div class="task-title">${esc(task.title)}</div>
      ${dueHtml}
      <button class="task-delete">✕</button>`;

    el.querySelector('.task-check').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTask(task, el);
    });
    el.querySelector('.task-delete').addEventListener('click', (e) => {
      this.deleteTask(e, task, el);
    });
    el.addEventListener('click', () => this.toggleTask(task, el));
    return el;
  },

  async toggleTask(task, el) {
    try {
      const result = await API.post('/api/tasks/toggle', {
        entity_id: task.list_id,
        item_uid: task.id,
        completed: task.completed,
      });
      const nowDone = result.completed;
      task.completed = nowDone;
      el.className = 'task-item' + (nowDone ? ' completed' : '');
      el.querySelector('.task-check').textContent = nowDone ? '✓' : '';
    } catch {
      Toast.show('Failed to update task');
    }
  },

  async deleteTask(e, task, el) {
    e.stopPropagation();
    el.style.transition = 'opacity 0.2s, transform 0.2s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 220);
    try {
      await API.post('/api/tasks/delete', {
        entity_id: task.list_id,
        item_uid: task.id,
      });
    } catch {
      Toast.show('Failed to delete task');
      this.loadTasks();
    }
  },

  toggleShowCompleted() {
    this._showCompleted = document.getElementById('show-completed-cb').checked;
    this.loadTasks();
  },

  promptAddList() {
    Modal.prompt({
      title: 'New List',
      placeholder: 'List name…',
      onConfirm: async (name) => {
        try {
          await API.post('/api/lists', { name });
          Toast.show('List added');
          this.loadLists();
        } catch {
          Toast.show('Failed to add list');
        }
      },
    });
  },

  promptAddTask() {
    if (!this._currentListId) return;
    Modal.prompt({
      title: 'New Task',
      placeholder: 'Task title…',
      onConfirm: async (title) => {
        try {
          const encodedId = encodeURIComponent(this._currentListId);
          const task = await API.post(`/api/lists/${encodedId}/tasks`, { title });
          const el = document.getElementById('task-items-container');
          const noMsg = el.querySelector('.dash-no-events');
          if (noMsg) noMsg.remove();
          el.appendChild(this._makeTaskEl(task));
          Toast.show('Task added');
        } catch {
          Toast.show('Failed to add task');
        }
      },
    });
  },
};

/* ── Calendar UI ────────────────────────────────────────────────────────── */
const CalUI = {
  _year: 0,
  _month: 0,
  _selected: null,
  _events: {},
  _initialized: false,

  init() {
    if (!this._initialized) {
      const now = new Date();
      this._year = now.getFullYear();
      this._month = now.getMonth();
      this._selected = now.toISOString().slice(0, 10);
      this._initialized = true;
    }
    this._render();
  },

  prevMonth() {
    this._month--;
    if (this._month < 0) { this._month = 11; this._year--; }
    this._render();
  },

  nextMonth() {
    this._month++;
    if (this._month > 11) { this._month = 0; this._year++; }
    this._render();
  },

  async _fetchEvents() {
    const firstDay = new Date(this._year, this._month, 1);
    const lastDay  = new Date(this._year, this._month + 1, 0);
    // Include a bit of padding
    const start = new Date(firstDay); start.setDate(start.getDate() - 7);
    const end   = new Date(lastDay);  end.setDate(end.getDate() + 7);

    const startStr = start.toISOString().slice(0, 10);
    const endStr   = end.toISOString().slice(0, 10);

    try {
      const data = await API.get(`/api/calendar/events?start=${startStr}&end=${endStr}`);

      if (!data.has_credentials) {
        document.getElementById('cal-no-creds').classList.remove('hidden');
      } else {
        document.getElementById('cal-no-creds').classList.add('hidden');
      }

      if (data.last_sync) {
        document.getElementById('cal-last-sync').textContent = 'Last synced: ' + formatDateTime(new Date(data.last_sync));
      }

      this._events = {};
      data.events.forEach(ev => {
        const d = ev.start_time.slice(0, 10);
        if (!this._events[d]) this._events[d] = [];
        this._events[d].push(ev);
      });
    } catch {
      // offline — use cached data already in _events
    }
  },

  async _render() {
    await this._fetchEvents();

    const label = new Date(this._year, this._month, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    document.getElementById('cal-month-label').textContent = label;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    const firstDow = new Date(this._year, this._month, 1).getDay();
    const daysInMonth = new Date(this._year, this._month + 1, 0).getDate();
    const today = new Date().toISOString().slice(0, 10);

    // Pad with previous month's days
    for (let i = 0; i < firstDow; i++) {
      const d = document.createElement('div');
      d.className = 'cal-day other-month';
      const prev = new Date(this._year, this._month, -firstDow + i + 1);
      d.innerHTML = `<span class="cal-day-num">${prev.getDate()}</span>`;
      grid.appendChild(d);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this._year}-${String(this._month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const evs = this._events[dateStr] || [];
      const isToday = dateStr === today;
      const isSelected = dateStr === this._selected;

      const d = document.createElement('div');
      d.className = 'cal-day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '');
      d.onclick = () => this.selectDay(dateStr);

      let dotsHtml = '';
      if (evs.length) {
        const colors = [...new Set(evs.slice(0, 3).map(e => e.color || '#4ecdc4'))];
        dotsHtml = `<div class="event-dots">${colors.map(c => `<span style="background:${c}"></span>`).join('')}</div>`;
      }

      d.innerHTML = `<span class="cal-day-num">${day}</span>${dotsHtml}`;
      grid.appendChild(d);
    }

    // Show events for selected day
    if (this._selected) this._showDayEvents(this._selected);
  },

  selectDay(dateStr) {
    this._selected = dateStr;
    document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
    // Re-find the clicked day element
    const grid = document.getElementById('cal-grid');
    const [, , d] = dateStr.split('-').map(Number);
    const dayEls = grid.querySelectorAll('.cal-day:not(.other-month)');
    if (dayEls[d - 1]) dayEls[d - 1].classList.add('selected');
    this._showDayEvents(dateStr);
  },

  _showDayEvents(dateStr) {
    const evs = this._events[dateStr] || [];
    const dateLabel = document.getElementById('cal-events-date');
    const list = document.getElementById('cal-events-list');

    dateLabel.textContent = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });

    list.innerHTML = '';
    if (!evs.length) {
      list.innerHTML = '<div class="cal-no-events">No events</div>';
      return;
    }
    evs.forEach(ev => {
      const el = document.createElement('div');
      el.className = 'cal-event-item';
      el.style.borderLeftColor = ev.color || '#4ecdc4';
      el.innerHTML = `
        <div class="cal-event-time">${formatEventTime(ev)}</div>
        <div>
          <div class="cal-event-title">${esc(ev.title)}</div>
          ${ev.location ? `<div class="cal-event-loc">📍 ${esc(ev.location)}</div>` : ''}
        </div>`;
      list.appendChild(el);
    });
  },
};

/* ── Camera UI ──────────────────────────────────────────────────────────── */
const CameraUI = {
  _active: false,

  start() {
    if (!App.cameraEnabled || this._active) return;
    this._active = true;
    const img = document.getElementById('camera-main-img');
    if (img) img.src = '/api/camera/stream';
  },

  stop() {
    if (!this._active) return;
    this._active = false;
    const img = document.getElementById('camera-main-img');
    if (img) img.src = '';
  },
};

/* ── Long Press Utility ─────────────────────────────────────────────────── */
function addLongPress(el, onTap, onLongPress, delay = 600) {
  let timer = null;
  let triggered = false;

  const start = () => {
    triggered = false;
    timer = setTimeout(() => {
      triggered = true;
      onLongPress();
    }, delay);
  };

  const cancel = () => clearTimeout(timer);

  const end = () => {
    clearTimeout(timer);
    if (!triggered) onTap();
  };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', cancel);
  // Mouse fallback for non-touch (desktop testing)
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', cancel);
}

/* ── Clock ──────────────────────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock-time').textContent = `${hh}:${mm}`;
  document.getElementById('clock-date').textContent = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

/* ── Offline Detection ──────────────────────────────────────────────────── */
function updateOnlineStatus() {
  const badge = document.getElementById('offline-badge');
  badge.classList.toggle('hidden', navigator.onLine);
}

window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

/* ── Utility Functions ──────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEventTime(ev) {
  if (ev.all_day) return 'All day';
  if (!ev.start_time) return '';
  const d = new Date(ev.start_time);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

/* ── Init ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 10000);
  updateOnlineStatus();

  // Load server config (camera on/off, title) then render dashboard
  await App.loadConfig();
  DashUI.refresh();

  // Refresh dashboard every 5 minutes while on it
  setInterval(() => {
    if (App.current === 'dashboard') DashUI.refresh();
  }, 300000);
});
