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
  _order: ['dashboard', 'tasks', 'calendar', 'pool'],

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
    if (screen === 'pool')      PoolUI.start();
    if (screen !== 'pool')      PoolUI.stop();
  },

  async loadConfig() {
    try {
      const s = await API.get('/api/status');
      if (s.title) document.title = s.title;
      if (s.camera_enabled) this.enableCamera();
      if (s.air_temp != null) {
        document.getElementById('air-temp-val').textContent = `${s.air_temp}°F`;
        document.getElementById('air-temp-display').classList.remove('hidden');
      }
    } catch {
      // Offline or server not reachable — camera stays hidden
    }
  },
};

/* ── Dashboard UI ───────────────────────────────────────────────────────── */
const DashUI = {
  async refresh() {
    await Promise.all([this.loadEvents(), this.loadTasks(), LightsUI.load()]);
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

      const taskResults = await Promise.all(
        lists.map(lst =>
          API.get(`/api/lists/${encodeURIComponent(lst.id)}/tasks?completed=false`)
               .catch(() => [])
        )
      );

      const MAX = 4;
      let anyTasks = false;

      lists.forEach((lst, i) => {
        const tasks = taskResults[i] || [];
        if (!tasks.length) return;
        anyTasks = true;

        // List header
        const header = document.createElement('div');
        header.className = 'dash-list-header';
        header.innerHTML = `
          <div class="dash-list-dot" style="background:${lst.color}"></div>
          <div class="dash-list-name">${esc(lst.name)}</div>
          <div class="dash-list-count" style="color:${lst.color}">${lst.pending || tasks.length}</div>`;
        el.appendChild(header);

        // Top 4 tasks
        tasks.slice(0, MAX).forEach(t => {
          const d = document.createElement('div');
          d.className = 'dash-task-item';
          d.innerHTML = `<span class="dash-task-bullet">•</span><span class="dash-task-title">${esc(t.title)}</span>`;
          el.appendChild(d);
        });

        // Fading ellipsis when there are more
        if (tasks.length > MAX) {
          const more = document.createElement('div');
          more.className = 'dash-task-more';
          more.textContent = '•••';
          el.appendChild(more);
        }
      });

      if (!anyTasks) {
        el.innerHTML = '<div class="dash-no-events">All done! 🎉</div>';
      }
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

      // Fetch pending tasks for all lists in parallel
      const taskResults = await Promise.all(
        lists.map(lst =>
          API.get(`/api/lists/${encodeURIComponent(lst.id)}/tasks?completed=false`)
               .catch(() => [])
        )
      );

      lists.forEach((lst, i) => {
        const tasks = taskResults[i] || [];
        const card = document.createElement('div');
        card.className = 'list-card';
        addLongPress(card,
          () => this.openDetail(lst),
          () => this.confirmDeleteList(lst)
        );

        const previewItems = tasks.slice(0, 4).map(t =>
          `<div class="list-card-task">${esc(t.title)}</div>`
        ).join('');
        const preview = previewItems ||
          `<div class="list-card-task list-card-empty">${lst.pending ? '' : 'All done!'}</div>`;

        card.innerHTML = `
          <div class="list-card-header">
            <div class="list-color-dot" style="background:${lst.color}"></div>
            <div class="list-card-name">${esc(lst.name)}</div>
            <div class="list-card-count-badge" style="color:${lst.color}">${lst.pending || 0}</div>
          </div>
          <div class="list-card-tasks">${preview}</div>
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
      <div class="task-check">${task.completed ? '✓' : '•'}</div>
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

    const body = document.createElement('div');

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'modal-input';
    titleInput.placeholder = 'Task title\u2026';
    titleInput.setAttribute('autocomplete', 'off');

    const dateRow = document.createElement('div');
    dateRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:12px;';

    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Due date';
    dateLabel.style.cssText = 'font-size:13px;color:var(--text-dim);flex-shrink:0;';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'modal-input';
    dateInput.style.cssText = 'flex:1;height:44px;font-size:15px;';

    dateRow.appendChild(dateLabel);
    dateRow.appendChild(dateInput);
    body.appendChild(titleInput);
    body.appendChild(dateRow);

    const doAdd = async () => {
      const title = titleInput.value.trim();
      if (!title) return;
      Modal.close();
      try {
        const encodedId = encodeURIComponent(this._currentListId);
        const payload = { title };
        if (dateInput.value) payload.due_date = dateInput.value;
        const task = await API.post(`/api/lists/${encodedId}/tasks`, payload);
        const el = document.getElementById('task-items-container');
        const noMsg = el.querySelector('.dash-no-events');
        if (noMsg) noMsg.remove();
        el.appendChild(this._makeTaskEl(task));
        Toast.show('Task added');
      } catch {
        Toast.show('Failed to add task');
      }
    };

    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    Modal.open({
      title: 'New Task',
      body,
      actions: [
        { label: 'Cancel', class: 'btn-secondary' },
        { label: 'Add', class: 'btn-primary', action: doAdd },
      ],
    });

    setTimeout(() => titleInput.focus(), 100);
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

/* ── Garage Lock Control ────────────────────────────────────────────────── */

const GARAGE_LOCKED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="11" width="18" height="11" rx="2"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
</svg>`;

const GARAGE_UNLOCKED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="11" width="18" height="11" rx="2"/>
  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
</svg>`;

const GarageUI = {
  _state: 'unknown',
  _pending: false,

  init() {
    this.poll();
    setInterval(() => this.poll(), 5000);
  },

  async poll() {
    try {
      const data = await API.get('/api/garage/status');
      if (!this._pending) this._applyState(data.state);
    } catch { /* silent */ }
  },

  _applyState(state) {
    this._state = state;
    this._pending = false;
    const btn  = document.getElementById('garage-lock-btn');
    const icon = document.getElementById('garage-lock-icon');
    if (!btn || !icon) return;
    btn.style.opacity = '';
    if (state === 'locked') {
      icon.innerHTML = GARAGE_LOCKED_SVG;
      btn.style.color = 'var(--success)';
      btn.title = 'Garage: Locked — tap to unlock';
    } else if (state === 'unlocked') {
      icon.innerHTML = GARAGE_UNLOCKED_SVG;
      btn.style.color = 'var(--danger)';
      btn.title = 'Garage: Unlocked — tap to lock';
    } else {
      icon.innerHTML = GARAGE_LOCKED_SVG;
      btn.style.color = 'var(--text-muted)';
      btn.title = 'Garage: Unknown';
    }
  },

  async toggle() {
    if (this._pending) return;
    const shouldLock = this._state !== 'locked';
    this._pending = true;
    const btn = document.getElementById('garage-lock-btn');
    if (btn) btn.style.opacity = '0.4';
    try {
      await API.post('/api/garage/lock', { lock: shouldLock });
      // Poll every second until state is confirmed (up to 8s)
      let tries = 0;
      const confirm = setInterval(async () => {
        tries++;
        try {
          const data = await API.get('/api/garage/status');
          const done = shouldLock ? data.state === 'locked' : data.state === 'unlocked';
          if (done || tries >= 8) {
            clearInterval(confirm);
            this._applyState(data.state);
          }
        } catch {
          if (tries >= 8) { clearInterval(confirm); this._pending = false; if (btn) btn.style.opacity = ''; }
        }
      }, 1000);
    } catch {
      Toast.show('Failed to toggle garage lock');
      this._pending = false;
      if (btn) btn.style.opacity = '';
    }
  },
};

/* ── Gate Control ───────────────────────────────────────────────────────── */

const GATE_CLOSED_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="2" width="3" height="20" rx="1.5"/>
  <rect x="20" y="2" width="3" height="20" rx="1.5"/>
  <line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

const GATE_OPEN_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="2" width="3" height="20" rx="1.5"/>
  <rect x="20" y="2" width="3" height="20" rx="1.5"/>
  <line x1="4" y1="7" x2="14" y2="2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="4" y1="12" x2="18" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="4" y1="17" x2="22" y2="8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

const GateUI = {
  _holdActive: false,
  _holdRemaining: 0,         // client-side smooth countdown (seconds)
  _countdownInterval: null,  // 1s tick for smooth display

  HOLD_OPTIONS: [
    { label: '5 min',  minutes: 5   },
    { label: '10 min', minutes: 10  },
    { label: '15 min', minutes: 15  },
    { label: '20 min', minutes: 20  },
    { label: '25 min', minutes: 25  },
    { label: '30 min', minutes: 30  },
    { label: '1 hr',   minutes: 60  },
    { label: '2 hr',   minutes: 120 },
    { label: '3 hr',   minutes: 180 },
    { label: '4 hr',   minutes: 240 },
    { label: '5 hr',   minutes: 300 },
    { label: '6 hr',   minutes: 360 },
    { label: '7 hr',   minutes: 420 },
    { label: '8 hr',   minutes: 480 },
  ],

  init() {
    this.poll();
    setInterval(() => this.poll(), 5000);
    addLongPress(
      document.getElementById('gate-btn'),
      () => this.onTap(),
      () => this.showHoldDialog()
    );
  },

  async poll() {
    try {
      const data = await API.get('/api/gate/status');
      this._applyState(data.state);
      this._applyHoldState(data.hold_active, data.hold_remaining);
    } catch { /* silent */ }
  },

  _applyState(state) {
    const icon = document.getElementById('gate-status-icon');
    if (!icon) return;
    if (state === 'open') {
      icon.innerHTML = GATE_OPEN_SVG;
      icon.style.color = 'var(--success)';
      icon.title = 'Back Gate: Open';
    } else if (state === 'closed') {
      icon.innerHTML = GATE_CLOSED_SVG;
      icon.style.color = 'var(--danger)';
      icon.title = 'Back Gate: Closed';
    } else {
      icon.innerHTML = GATE_CLOSED_SVG;
      icon.style.color = 'var(--text-muted)';
      icon.title = 'Back Gate: Unknown';
    }
  },

  _applyHoldState(holdActive, holdRemaining) {
    this._holdActive = holdActive;
    if (holdActive && holdRemaining > 0) {
      // Resync client countdown from server; start tick if not already running
      this._holdRemaining = holdRemaining;
      if (!this._countdownInterval) {
        this._countdownInterval = setInterval(() => {
          if (this._holdRemaining > 0) {
            this._holdRemaining--;
            this._renderCountdown();
          }
        }, 1000);
      }
      this._renderCountdown();
    } else {
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = null;
      }
      this._holdRemaining = 0;
      const btn = document.getElementById('gate-btn');
      const labelEl = document.getElementById('gate-btn-label');
      const hintEl = document.getElementById('gate-btn-hint');
      if (btn) btn.classList.remove('hold-active');
      if (labelEl) labelEl.textContent = 'Open';
      if (hintEl) hintEl.textContent = 'Hold to Extend';
    }
  },

  _renderCountdown() {
    const btn = document.getElementById('gate-btn');
    const labelEl = document.getElementById('gate-btn-label');
    const hintEl = document.getElementById('gate-btn-hint');
    if (!btn || !labelEl) return;
    btn.classList.add('hold-active');
    const s = this._holdRemaining % 60;
    const m = Math.floor((this._holdRemaining % 3600) / 60);
    const h = Math.floor(this._holdRemaining / 3600);
    labelEl.textContent = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
    if (hintEl) hintEl.textContent = 'Tap to Cancel';
  },

  onTap() {
    if (this._holdActive) {
      Modal.open({
        title: 'Cancel Hold-Open?',
        body: '<p style="color:var(--text-dim);font-size:14px">Stop automatically reopening the gate?</p>',
        actions: [
          { label: 'Keep Going', class: 'btn-secondary' },
          { label: 'Cancel Hold', class: 'btn-primary', action: () => this.cancelHold() },
        ],
      });
    } else {
      this.openOnce();
    }
  },

  async openOnce() {
    try {
      await API.post('/api/gate/open', {});
      Toast.show('Gate opening\u2026');
    } catch {
      Toast.show('Failed to open gate');
    }
  },

  showHoldDialog() {
    const opts = this.HOLD_OPTIONS;
    let selectedIdx = 0;

    const body = document.createElement('div');
    body.className = 'hold-modal-body';

    const valDisplay = document.createElement('div');
    valDisplay.className = 'hold-duration-display';
    valDisplay.textContent = opts[0].label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'hold-range';
    slider.min = 0;
    slider.max = opts.length - 1;
    slider.value = 0;
    slider.step = 1;

    const endLabels = document.createElement('div');
    endLabels.className = 'hold-range-ends';
    endLabels.innerHTML = `<span>${opts[0].label}</span><span>${opts[opts.length - 1].label}</span>`;

    slider.addEventListener('input', () => {
      selectedIdx = parseInt(slider.value, 10);
      valDisplay.textContent = opts[selectedIdx].label;
    });

    body.appendChild(valDisplay);
    body.appendChild(slider);
    body.appendChild(endLabels);

    Modal.open({
      title: 'Hold Gate Open',
      body,
      actions: [
        { label: 'Cancel', class: 'btn-secondary' },
        { label: 'Start', class: 'btn-primary', action: () => this.startHold(opts[selectedIdx].minutes) },
      ],
    });
  },

  async startHold(minutes) {
    try {
      await API.post('/api/gate/hold', { minutes });
      const label = minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`;
      Toast.show(`Holding gate open for ${label}`);
      await this.poll(); // Immediately reflect new state
    } catch {
      Toast.show('Failed to start hold-open');
    }
  },

  async cancelHold() {
    try {
      await fetch('/api/gate/hold', { method: 'DELETE' });
    } catch { /* silent */ }
    this._applyHoldState(false, 0);
    Toast.show('Hold-open cancelled');
  },
};

/* ── Lights & Switches UI ───────────────────────────────────────────────── */
const LightsUI = {
  _items: [],

  async load() {
    try {
      this._items = await API.get('/api/lights');
      this._render();
    } catch { /* silent */ }
  },

  _render() {
    const grid = document.getElementById('dash-lights-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this._items.forEach(item => {
      const on = item.state === 'on';
      const unavail = item.state === 'unavailable' || item.state === 'unknown';
      const btn = document.createElement('button');
      btn.className = 'light-tile' + (on ? ' active' : '') + (unavail ? ' unavailable' : '');
      btn.dataset.entityId = item.entity_id;
      btn.dataset.state = item.state;
      btn.innerHTML = `
        <span class="light-tile-icon">${item.icon}</span>
        <span class="light-tile-name">${esc(item.name)}</span>
        <span class="light-tile-state">${on ? 'ON' : (unavail ? '—' : 'OFF')}</span>`;
      if (!unavail) {
        btn.addEventListener('click', () => this.toggle(item.entity_id, on));
      }
      grid.appendChild(btn);
    });
  },

  async toggle(entityId, currentOn) {
    // Optimistic update
    const btn = document.querySelector(`.light-tile[data-entity-id="${entityId}"]`);
    const nowOn = !currentOn;
    if (btn) {
      btn.classList.toggle('active', nowOn);
      btn.dataset.state = nowOn ? 'on' : 'off';
      btn.querySelector('.light-tile-state').textContent = nowOn ? 'ON' : 'OFF';
      // Rebind click with new state
      btn.replaceWith(btn.cloneNode(true));
      const newBtn = document.querySelector(`.light-tile[data-entity-id="${entityId}"]`);
      if (newBtn) newBtn.addEventListener('click', () => this.toggle(entityId, nowOn));
    }
    try {
      await API.post('/api/lights/toggle', { entity_id: entityId, on: nowOn });
    } catch {
      Toast.show('Failed to toggle');
      this.load(); // revert on failure
    }
  },
};

/* ── Pool UI ────────────────────────────────────────────────────────────── */
const PoolUI = {
  _pollInterval: null,
  _setpoints: { pool: 80, spa: 102 },
  _modes:     { pool: 'off', spa: 'off' },

  _LIGHT_EFFECTS: [
    'Alpine White','Sky Blue','Cobalt Blue','Caribbean Blue','Spring Green',
    'Emerald Green','Emerald Rose','Magenta','Violet','Slow Splash',
    'Fast Splash','USA!','Fat Tuesday','Disco Tech',
  ],

  start() {
    this._buildEffects();
    this.load();
    if (!this._pollInterval) {
      this._pollInterval = setInterval(() => this.load(), 10000);
    }
  },

  stop() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  _buildEffects() {
    const el = document.getElementById('pool-effects-scroll');
    if (!el || el.children.length) return;
    this._LIGHT_EFFECTS.forEach(fx => {
      const btn = document.createElement('button');
      btn.className = 'pool-effect-btn';
      btn.textContent = fx;
      btn.dataset.effect = fx;
      btn.onclick = () => this.setLightEffect(fx);
      el.appendChild(btn);
    });
  },

  _goodVal(entity) {
    const s = entity?.state;
    return (s && s !== 'unknown' && s !== 'unavailable') ? s : null;
  },

  async load() {
    try {
      const d = await API.get('/api/pool/status');

      // Temps
      const pt = this._goodVal(d.pool_temp);
      document.getElementById('pool-temp-val').textContent = pt ? `${pt}°F` : '--';
      const st = this._goodVal(d.spa_temp);
      document.getElementById('spa-temp-val').textContent = st ? `${st}°F` : '--';

      // Switches
      [
        [d.pool_pump,   'pool-pump-btn',       'pool-pump-state'],
        [d.pool_heater, 'pool-heater-btn',     'pool-heater-state'],
        [d.spa_pump,    'spa-pump-btn',        'spa-pump-state'],
        [d.spa_heater,  'spa-heater-btn',      'spa-heater-state'],
        [d.spillover,   'pool-spillover-btn',  'pool-spillover-state'],
        [d.waterfall,   'pool-waterfall-btn',  'pool-waterfall-state'],
      ].forEach(([entity, btnId, stateId]) => this._applySwitch(entity, btnId, stateId));

      // Light
      const lightOn = d.light?.state === 'on';
      const lBtn = document.getElementById('pool-light-btn');
      lBtn.classList.toggle('active', lightOn);
      lBtn.dataset.currentState = d.light?.state || 'off';
      document.getElementById('pool-light-state').textContent = lightOn ? 'ON' : 'OFF';
      document.getElementById('pool-effects-row').classList.toggle('hidden', !lightOn);
      if (lightOn && d.light?.attributes?.effect) this._highlightEffect(d.light.attributes.effect);

      // Setpoints
      this._applySetpoint(d.pool_setpoint, 'pool');
      this._applySetpoint(d.spa_setpoint,  'spa');

      // Water quality
      const qmap = {
        'q-air-temp': d.air_temp,
        'q-ph':       d.ph,
        'q-orp':      d.orp,
        'q-pool-sal': d.salinity,
        'q-spa-sal':  d.spa_salinity,
      };
      Object.entries(qmap).forEach(([id, entity]) => {
        const v = this._goodVal(entity);
        document.getElementById(id).textContent = v ?? '--';
      });
    } catch { /* silent */ }
  },

  _applySwitch(entity, btnId, stateId) {
    const on = entity?.state === 'on';
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.toggle('active', on);
    btn.dataset.currentState = entity?.state || 'off';
    const el = document.getElementById(stateId);
    if (el) el.textContent = on ? 'ON' : 'OFF';
  },

  _applySetpoint(entity, zone) {
    if (!entity) return;
    this._setpoints[zone] = entity.attributes?.temperature ?? this._setpoints[zone];
    this._modes[zone] = entity.state || 'off';
    document.getElementById(`${zone}-setpoint-val`).textContent = `${this._setpoints[zone]}°F`;
    document.getElementById(`${zone}-mode-off`).classList.toggle('active', this._modes[zone] === 'off');
    document.getElementById(`${zone}-mode-heat`).classList.toggle('active', this._modes[zone] === 'heat');
  },

  _highlightEffect(effect) {
    document.querySelectorAll('.pool-effect-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.effect === effect));
  },

  async toggleSwitch(entityId, btnId, stateId) {
    const btn = document.getElementById(btnId);
    const currentOn = btn?.dataset.currentState === 'on';
    try {
      await API.post('/api/pool/switch', { entity_id: entityId, on: !currentOn });
      Toast.show(!currentOn ? 'On' : 'Off');
      setTimeout(() => this.load(), 800);
    } catch { Toast.show('Failed'); }
  },

  async toggleLight() {
    const btn = document.getElementById('pool-light-btn');
    const currentOn = btn?.dataset.currentState === 'on';
    try {
      await API.post('/api/pool/light', { on: !currentOn });
      Toast.show(`Light ${!currentOn ? 'on' : 'off'}`);
      setTimeout(() => this.load(), 800);
    } catch { Toast.show('Failed to toggle light'); }
  },

  async setLightEffect(effect) {
    try {
      await API.post('/api/pool/light', { effect });
      this._highlightEffect(effect);
      Toast.show(effect);
    } catch { Toast.show('Failed to set effect'); }
  },

  async setMode(entityId, zone, mode) {
    try {
      await API.post('/api/pool/setpoint', { entity_id: entityId, mode });
      this._modes[zone] = mode;
      document.getElementById(`${zone}-mode-off`).classList.toggle('active', mode === 'off');
      document.getElementById(`${zone}-mode-heat`).classList.toggle('active', mode === 'heat');
      Toast.show(`${zone === 'pool' ? 'Pool' : 'Spa'} heater: ${mode.toUpperCase()}`);
    } catch { Toast.show('Failed to set mode'); }
  },

  async adjustTemp(entityId, zone, delta) {
    const cur = this._setpoints[zone];
    const next = Math.min(104, Math.max(34, cur + delta));
    if (next === cur) return;
    this._setpoints[zone] = next;
    document.getElementById(`${zone}-setpoint-val`).textContent = `${next}°F`;
    try {
      await API.post('/api/pool/setpoint', { entity_id: entityId, temperature: next });
    } catch {
      Toast.show('Failed to set temperature');
      this._setpoints[zone] = cur;
      document.getElementById(`${zone}-setpoint-val`).textContent = `${cur}°F`;
    }
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
  const h = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  document.getElementById('clock-time').textContent = `${h12}:${mm} ${ampm}`;
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
  GarageUI.init();
  GateUI.init();
  DashUI.refresh();

  // Refresh dashboard every 5 minutes while on it
  setInterval(() => {
    if (App.current === 'dashboard') DashUI.refresh();
  }, 300000);
});
