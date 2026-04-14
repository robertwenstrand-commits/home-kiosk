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
    document.getElementById('screen-camera').classList.remove('hidden');
    document.getElementById('nav-camera').classList.remove('hidden');
  },

  navigate(to) {
    if (AdminUI && AdminUI._comboFired) return; // swallow nav when admin combo is active
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

    // After animation, snap fromEl to its CSS off-screen default (translateX(100%))
    // without triggering another CSS transition. We must disable the transition first,
    // force a reflow to commit it, then clear inline styles — otherwise the CSS
    // transition would animate fromEl from -25% → 100% (the "flies to the right" bug).
    setTimeout(() => {
      fromEl.style.transition = 'none';
      toEl.style.transition   = 'none';
      fromEl.style.transform  = '';
      toEl.style.transform    = '';
      void fromEl.offsetHeight; // commit no-transition before re-enabling CSS transitions
      fromEl.style.transition = '';
      toEl.style.transition   = '';
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
    await Promise.all([this.loadEvents(), this.loadTasks(), LightsUI.load(), HomeStatsUI.load(), UpsUI.load()]);
  },

  async loadEvents() {
    const el = document.getElementById('dash-events-body');
    try {
      const today    = _localDateStr(new Date());
      const tomorrow = _localDateStr(new Date(Date.now() + 86400000));
      const [todayData, tomorrowData] = await Promise.all([
        API.get(`/api/calendar/today?date=${today}`),
        API.get(`/api/calendar/today?date=${tomorrow}`),
      ]);
      if (!todayData.has_credentials) {
        el.innerHTML = '<div class="dash-no-events">Calendar not connected</div>';
        return;
      }
      el.innerHTML = '<div class="dash-events-cols"><div id="dash-col-today"></div><div id="dash-col-tomorrow"></div></div>';
      this._renderEventCol('dash-col-today',    todayData.events,    'Today');
      this._renderEventCol('dash-col-tomorrow', tomorrowData.events, 'Tomorrow');
    } catch {
      el.innerHTML = '<div class="dash-no-events">Offline</div>';
    }
  },

  _renderEventCol(containerId, events, heading) {
    const col = document.getElementById(containerId);
    const head = document.createElement('div');
    head.className = 'dash-col-head';
    head.textContent = heading;
    col.appendChild(head);
    if (!events.length) {
      col.insertAdjacentHTML('beforeend', '<div class="dash-no-events">No events</div>');
      return;
    }
    events.forEach(ev => {
      const d = document.createElement('div');
      d.className = 'dash-event';
      d.innerHTML = `
        <div class="event-dot" style="background:${ev.color || '#4ecdc4'}"></div>
        <div class="event-info">
          <div class="event-title">${esc(ev.title)}</div>
          <div class="event-time">${formatEventTime(ev)}</div>
        </div>`;
      col.appendChild(d);
    });
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

      const taskResults = await _fetchPendingTasks(lists);

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
          d.innerHTML = `<span class="dash-task-circle"></span><span class="dash-task-title">${esc(t.title)}</span>`;
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

/* ── Home Stats UI (Powerwall + Catbox) ─────────────────────────────────── */
const _CATBOX_STATUS = {
  rdy: 'Ready',        cln: 'Cleaning',        ccc: 'Cycle Complete',
  csf: 'Sensor Fault', cstp: 'Cat Detected',   cs:  'Cat Detected',
  br:  'Drawer Full',  dfs:  'Drawer Full',     lf:  'Litter Full',
  off: 'Off',          pd:   'Pinch Detect',    paused: 'Paused',
  scf: 'Sensor Fault', dhf:  'Dustpan Full',    hpf: 'Hopper Empty',
};

const HomeStatsUI = {
  async load() {
    try {
      const data = await API.get('/api/home-stats');
      this._renderPowerwall(data.powerwall);
      this._renderCatbox(data.catbox);
    } catch {
      ['dash-powerwall-body', 'dash-catbox-body'].forEach(id => {
        document.getElementById(id).innerHTML = '<div class="dash-no-events">Offline</div>';
      });
    }
  },

  _renderPowerwall(pw) {
    const el   = document.getElementById('dash-powerwall-body');
    const pct  = Math.min(100, Math.max(0, pw.pct));
    const col  = pct > 50 ? 'var(--success)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
    const w    = Math.abs(pw.power_w);
    const flow = pw.power_w >  50 ? `Discharging ${(w / 1000).toFixed(1)} kW`
               : pw.power_w < -50 ? `Charging ${(w / 1000).toFixed(1)} kW`
               : 'Standby';
    el.innerHTML = `
      <div class="stat-pct-row">
        <span class="stat-pct-big" style="color:${col}">${pct}%</span>
        <span class="stat-kwh-label">${pw.kwh} kWh stored</span>
      </div>
      <div class="stat-bar-track"><div class="stat-bar" style="width:${pct}%;background:${col}"></div></div>
      <div class="stat-footer">${flow}</div>`;
  },

  _renderCatbox(cat) {
    const el          = document.getElementById('dash-catbox-body');
    const statusLabel = _CATBOX_STATUS[cat.status] || cat.status;
    const litterCol   = cat.litter_pct < 20 ? 'var(--danger)' : cat.litter_pct < 40 ? 'var(--warn)' : 'var(--success)';
    const drawerCol   = cat.waste_pct >= 90 ? 'var(--danger)' : cat.waste_pct >= 70 ? 'var(--warn)' : 'var(--success)';
    const drawerWarn  = cat.waste_pct >= 90 ? ' ⚠' : '';
    el.innerHTML = `
      <div class="stat-row">
        <span class="stat-row-label">Litter</span>
        <div class="stat-bar-track" style="flex:1"><div class="stat-bar" style="width:${cat.litter_pct}%;background:${litterCol}"></div></div>
        <span class="stat-row-val">${cat.litter_pct}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-row-label">Drawer</span>
        <div class="stat-bar-track" style="flex:1"><div class="stat-bar" style="width:${cat.waste_pct}%;background:${drawerCol}"></div></div>
        <span class="stat-row-val${cat.waste_pct >= 90 ? ' stat-warn' : ''}">${cat.waste_pct}%${drawerWarn}</span>
      </div>
      <div class="stat-footer">${statusLabel}</div>`;
  },
};

/* ── UPS UI (local battery pack — only shown if localhost:7070/ups responds) */
const UpsUI = {
  async load() {
    try {
      const data = await fetch('http://localhost:7070/ups').then(r => r.json());
      if (data.battery_pct === null) return;
      this._renderCard(data);
      this._renderTopbar(data);
      document.getElementById('dash-ups').classList.remove('hidden');
      document.getElementById('topbar-battery').classList.remove('hidden');
    } catch {
      // No UPS service on this device — stays hidden
    }
  },

  _renderCard(data) {
    const el  = document.getElementById('dash-ups-body');
    const pct = Math.min(100, Math.max(0, data.battery_pct));
    const col = pct > 50 ? 'var(--success)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
    const status = data.vin === 'GOOD' ? 'Charging' : 'On Battery';
    const v = (data.vout_mv / 1000).toFixed(2);
    el.innerHTML = `
      <div class="stat-pct-row">
        <span class="stat-pct-big" style="color:${col}">${pct}%</span>
        <span class="stat-kwh-label">${status} &middot; ${v}V</span>
      </div>
      <div class="stat-bar-track"><div class="stat-bar" style="width:${pct}%;background:${col}"></div></div>`;
  },

  _renderTopbar(data) {
    const pct  = Math.min(100, Math.max(0, data.battery_pct));
    const col  = pct > 50 ? 'var(--success)' : pct > 20 ? 'var(--warn)' : 'var(--danger)';
    // Fill bar: max inner width is 44px (48px body - 2px padding each side)
    const fillW = Math.round(pct * 44 / 100);
    document.getElementById('battery-fill').setAttribute('width', fillW);
    document.getElementById('battery-fill').setAttribute('fill', col);
    document.getElementById('battery-bolt').setAttribute('opacity', data.vin === 'GOOD' ? '1' : '0');
    document.getElementById('battery-pct-text').textContent = `${pct}%`;
    document.getElementById('battery-pct-text').style.color = col;
    // Shift bolt to center of filled portion when charging
    if (data.vin === 'GOOD') {
      const boltX = Math.max(14, Math.min(36, 3 + fillW / 2));
      document.getElementById('battery-bolt').setAttribute('x', boltX);
    }
  },
};

/* ── Tasks UI ───────────────────────────────────────────────────────────── */
const TASK_CHECK_SVG = `<svg viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6 5,9.5 10.5,2.5"/></svg>`;

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

      const taskResults = await _fetchPendingTasks(lists);

      lists.forEach((lst, i) => {
        const tasks = taskResults[i] || [];
        const card = document.createElement('div');
        card.className = 'list-card';
        addLongPress(card,
          () => this.openDetail(lst),
          () => this.confirmDeleteList(lst)
        );

        const previewItems = tasks.slice(0, 4).map(t =>
          `<div class="list-card-task"><div class="list-card-task-check"></div><span class="list-card-task-title">${esc(t.title)}</span></div>`
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
      const id  = this._currentListId;
      const enc = encodeURIComponent(id);
      // Fetch pending tasks; also fetch completed if we need today's completions
      const needToday    = !this._showCompleted && CompletionStore.hasAnyToday(id);
      const [tasks, all] = await Promise.all([
        API.get(`/api/lists/${enc}/tasks?completed=${this._showCompleted}`),
        needToday ? API.get(`/api/lists/${enc}/tasks?completed=true`).catch(() => []) : Promise.resolve([]),
      ]);

      const combined = this._mergeTodayCompleted(tasks, all, id);
      el.innerHTML = '';
      if (!combined.length) {
        el.innerHTML = `<div class="dash-no-events" style="padding:20px 0">${
          this._showCompleted ? 'No tasks' : 'No pending tasks. Tap + to add one.'
        }</div>`;
        return;
      }
      combined.forEach(t => {
        const taskEl = this._makeTaskEl(t);
        if (!this._showCompleted && t.completed && CompletionStore.isCompletedToday(id, t.id)) {
          taskEl.classList.add('completed-today');
        }
        el.appendChild(taskEl);
      });
    } catch {
      el.innerHTML = '<div class="dash-no-events">Failed to load tasks</div>';
    }
  },

  _mergeTodayCompleted(pending, all, entityId) {
    if (!all.length) return pending;
    const seen = new Set(pending.map(t => t.id));
    const todayDone = all.filter(t =>
      t.completed && !seen.has(t.id) && CompletionStore.isCompletedToday(entityId, t.id)
    );
    return [...pending, ...todayDone];
  },

  _makeTaskEl(task) {
    const el = document.createElement('div');
    el.className = 'task-item' + (task.completed ? ' completed' : '');

    const dueHtml = this._dueDateHtml(task);

    el.innerHTML = `
      <div class="task-check">${TASK_CHECK_SVG}</div>
      <div class="task-title">${esc(task.title)}</div>
      ${dueHtml}
      <button class="task-delete" aria-label="Delete">&#10005;</button>`;

    // Circle toggles completion; title taps open edit; delete removes
    el.querySelector('.task-check').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTask(task, el);
    });
    el.querySelector('.task-title').addEventListener('click', (e) => {
      e.stopPropagation();
      this.promptEditTask(task, el);
    });
    el.querySelector('.task-delete').addEventListener('click', (e) => {
      this.deleteTask(e, task, el);
    });
    return el;
  },

  _dueDateHtml(task) {
    if (!task.due_date) return '';
    const due   = new Date(task.due_date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = !task.completed && due < today;
    return `<div class="task-due${overdue ? ' overdue' : ''}">${formatDate(due)}</div>`;
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
      CompletionStore.set(task.list_id, task.id, nowDone);
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

  _buildEditTaskForm(task) {
    const body = document.createElement('div');

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'modal-input';
    titleInput.value = task.title;
    titleInput.setAttribute('autocomplete', 'off');

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'modal-input';
    dateInput.style.cssText = 'margin-top:10px;height:44px;font-size:15px;';
    dateInput.value = task.due_date || '';

    const notesInput = document.createElement('textarea');
    notesInput.className = 'modal-textarea';
    notesInput.placeholder = 'Notes\u2026';
    notesInput.value = task.description || '';

    body.appendChild(titleInput);
    body.appendChild(dateInput);
    body.appendChild(notesInput);
    return { body, titleInput, dateInput, notesInput };
  },

  promptEditTask(task, el) {
    const { body, titleInput, dateInput, notesInput } = this._buildEditTaskForm(task);

    const doSave = async () => {
      const title = titleInput.value.trim();
      if (!title) return;
      Modal.close();
      try {
        await API.post('/api/tasks/update', {
          entity_id:   task.list_id,
          item_uid:    task.id,
          title,
          due_date:    dateInput.value || null,
          description: notesInput.value.trim() || null,
        });
        task.title       = title;
        task.due_date    = dateInput.value || null;
        task.description = notesInput.value.trim() || null;
        el.querySelector('.task-title').textContent = title;
        // Refresh due date display
        const existing = el.querySelector('.task-due');
        const newDue   = this._dueDateHtml(task);
        if (existing) existing.outerHTML = newDue;
        else if (newDue) el.querySelector('.task-delete').insertAdjacentHTML('beforebegin', newDue);
        Toast.show('Task updated');
      } catch {
        Toast.show('Failed to update task');
      }
    };

    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    Modal.open({
      title: 'Edit Task',
      body,
      actions: [
        { label: 'Cancel', class: 'btn-secondary' },
        { label: 'Save',   class: 'btn-primary', action: doSave },
      ],
    });
    setTimeout(() => titleInput.focus(), 100);
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
  _selected: null,
  _events: {},
  _initialized: false,

  init() {
    const now = new Date();
    if (!this._selected) this._selected = now.toISOString().slice(0, 10);
    if (!this._initialized) {
      this._initialized = true;
      document.getElementById('cal-day-view-close')
        .addEventListener('click', () => this._closeDayView());
      document.getElementById('cal-day-view-overlay')
        .addEventListener('click', () => this._closeDayView());
    }
    this._render();
  },

  async _fetchAllEvents() {
    const now = new Date();
    const start = new Date(now); start.setFullYear(start.getFullYear() - 2);
    const end   = new Date(now); end.setFullYear(end.getFullYear() + 2);
    try {
      const data = await API.get(`/api/calendar/events?start=${start.toISOString().slice(0,10)}&end=${end.toISOString().slice(0,10)}`);
      if (!data.has_credentials) {
        document.getElementById('cal-no-creds').classList.remove('hidden');
      } else {
        document.getElementById('cal-no-creds').classList.add('hidden');
      }
      if (data.last_sync) {
        document.getElementById('cal-last-sync').textContent =
          'Last synced: ' + formatDateTime(new Date(data.last_sync));
      }
      this._events = {};
      (data.events || []).forEach(ev => {
        const d = ev.start_time.slice(0, 10);
        if (!this._events[d]) this._events[d] = [];
        this._events[d].push(ev);
      });
    } catch { /* offline — use cached */ }
  },

  async _render() {
    await this._fetchAllEvents();
    this._buildGrid();
    this._scrollToToday();
  },

  _buildGrid() {
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    const today = new Date().toISOString().slice(0, 10);

    // Start on Sunday of week 1 year ago
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // End on Saturday 1 year from now
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setHours(0, 0, 0, 0);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    let prevMonthKey = '';
    const cur = new Date(startDate);

    while (cur <= endDate) {
      // Collect 7 days for this week
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        weekDays.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }

      // Add month separator if a new month starts within this week
      for (const d of weekDays) {
        const mk = `${d.getFullYear()}-${d.getMonth()}`;
        if (mk !== prevMonthKey) {
          const sep = document.createElement('div');
          sep.className = 'cal-month-sep';
          sep.textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          grid.appendChild(sep);
          prevMonthKey = mk;
          break;
        }
      }

      // Render 7 day cells
      weekDays.forEach(date => {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        const evs = this._events[dateStr] || [];
        const isToday    = dateStr === today;
        const isSelected = dateStr === this._selected;

        const d = document.createElement('div');
        d.className = 'cal-day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '');
        d.dataset.date = dateStr;
        d.onclick = () => this.selectDay(dateStr);
        d.innerHTML = `<span class="cal-day-num">${date.getDate()}</span>${_buildDayBulletsHtml(evs)}`;
        grid.appendChild(d);
      });
    }
  },

  _scrollToToday() {
    const todayEl = document.querySelector('.cal-day.today');
    if (!todayEl) return;
    const content = document.getElementById('screen-calendar').querySelector('.screen-content');
    const headerEl = document.getElementById('cal-grid-header');
    const headerH = headerEl ? headerEl.offsetHeight : 40;
    // Put today's row at the top, just below the sticky header
    setTimeout(() => {
      content.scrollTop = todayEl.offsetTop - headerH - 4;
    }, 50);
  },

  selectDay(dateStr) {
    this._selected = dateStr;
    document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
    const dayEl = document.querySelector(`.cal-day[data-date="${dateStr}"]`);
    if (dayEl) dayEl.classList.add('selected');
    this._openDayView(dateStr);
  },

  _openDayView(dateStr) {
    const cols = document.getElementById('cal-day-view-cols');
    cols.innerHTML = '';

    for (let i = 0; i < 3; i++) {
      const date = new Date(dateStr + 'T12:00:00');
      date.setDate(date.getDate() + i);
      const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const evs = this._events[ds] || [];

      const col = document.createElement('div');
      col.className = 'cal-day-col' + (i === 0 ? ' cal-day-col-primary' : '');

      const hdr = document.createElement('div');
      hdr.className = 'cal-day-col-header';
      hdr.textContent = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      col.appendChild(hdr);

      const list = document.createElement('div');
      list.className = 'cal-day-col-events';
      if (!evs.length) {
        list.innerHTML = '<div class="cal-no-events">No events</div>';
      } else {
        evs.forEach(ev => {
          const el = document.createElement('div');
          el.className = 'cal-event-item';
          el.style.borderLeftColor = ev.color || '#4ecdc4';
          el.innerHTML = `
            <div class="cal-event-time">${formatEventTime(ev)}</div>
            <div>
              <div class="cal-event-title">${esc(ev.title)}</div>
              ${ev.location    ? `<div class="cal-event-loc">📍 ${esc(ev.location)}</div>` : ''}
              ${ev.description ? `<div class="cal-event-loc">${esc(ev.description)}</div>` : ''}
            </div>`;
          list.appendChild(el);
        });
      }
      col.appendChild(list);
      cols.appendChild(col);
    }

    document.getElementById('cal-day-view').classList.add('open');
    document.getElementById('cal-day-view-overlay').classList.add('visible');
  },

  _closeDayView() {
    document.getElementById('cal-day-view').classList.remove('open');
    document.getElementById('cal-day-view-overlay').classList.remove('visible');
  },
};

/* ── Camera UI ──────────────────────────────────────────────────────────── */
const CameraUI = {
  _active: false,
  _cameras: [],
  _currentId: null,

  async start() {
    if (!App.cameraEnabled) return;
    if (!this._cameras.length) await this._loadCameras();
    this._active = true;
    if (!this._currentId && this._cameras.length) {
      this._switchTo(this._cameras[0].id);
    } else if (this._currentId) {
      document.getElementById('camera-main-img').src = `/api/camera/stream/${this._currentId}`;
    }
  },

  stop() {
    if (!this._active) return;
    this._active = false;
    document.getElementById('camera-main-img').src = '';
  },

  async _loadCameras() {
    try {
      this._cameras = await API.get('/api/cameras');
    } catch { return; }
    const sidebar = document.getElementById('camera-sidebar');
    sidebar.innerHTML = '';
    this._cameras.forEach(cam => {
      const btn = document.createElement('button');
      btn.className = 'cam-btn';
      btn.textContent = cam.name;
      btn.dataset.id = cam.id;
      btn.onclick = () => this._switchTo(cam.id);
      sidebar.appendChild(btn);
    });
  },

  _switchTo(id) {
    this._currentId = id;
    const img = document.getElementById('camera-main-img');
    img.src = '';
    img.src = `/api/camera/stream/${id}`;
    const cam = this._cameras.find(c => c.id === id);
    document.getElementById('camera-active-name').textContent = cam ? cam.name : '';
    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === id);
    });
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
      icon.style.color = 'var(--danger)';
      icon.title = 'Back Gate: Open';
    } else if (state === 'closed') {
      icon.innerHTML = GATE_CLOSED_SVG;
      icon.style.color = 'var(--success)';
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
      await API.del('/api/gate/hold');
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
        <span class="light-tile-name">${esc(item.name)}</span>
        <div class="light-tile-paddle">
          <div class="light-tile-paddle-on">${item.icon}</div>
          <div class="light-tile-paddle-off">O</div>
        </div>`;
      if (!unavail) {
        // Read state from dataset at click time — no need to rebind after toggle
        btn.addEventListener('click', () => this.toggle(item.entity_id, btn.dataset.state === 'on'));
      }
      grid.appendChild(btn);
    });
  },

  async toggle(entityId, currentOn) {
    const nowOn = !currentOn;
    const btn = document.querySelector(`.light-tile[data-entity-id="${entityId}"]`);
    if (btn) {
      btn.classList.toggle('active', nowOn);
      btn.dataset.state = nowOn ? 'on' : 'off';
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
  _pollInterval:    null,
  _cdInterval:      null,
  _cdEnd:           0,
  _cdTotal:         0,
  _setpoints:       { pool: 80, spa: 102 },

  _LIGHT_EFFECTS: [
    { name: 'Alpine White',   color: '#f0f0e8' },
    { name: 'Sky Blue',       color: '#87ceeb' },
    { name: 'Cobalt Blue',    color: '#0047ab' },
    { name: 'Caribbean Blue', color: '#00c5cd' },
    { name: 'Spring Green',   color: '#00c878' },
    { name: 'Emerald Green',  color: '#50c878' },
    { name: 'Emerald Rose',   color: '#9b2335' },
    { name: 'Magenta',        color: '#ff00cc' },
    { name: 'Violet',         color: '#8b00ff' },
    { name: 'Slow Splash',    color: '#4169e1' },
    { name: 'Fast Splash',    color: '#1e90ff' },
    { name: 'USA!',           color: '#b22234' },
    { name: 'Fat Tuesday',    color: '#7b2d8b' },
    { name: 'Disco Tech',     color: '#ff1493' },
  ],

  _PRESETS: {
    pool: [
      { label: 'Pool Pump On',  entity: 'switch.pool_pump',  on: true  },
      { label: 'Spillover On',  entity: 'switch.spillover',  on: true  },
    ],
    spa: [
      { label: 'Spillover Off', entity: 'switch.spillover',  on: false },
      { label: 'Spa Pump On',   entity: 'switch.spa_pump',   on: true  },
      { label: 'Spa Heater On', entity: 'switch.spa_heater', on: true  },
    ],
    off: [
      { label: 'Spa Heater Off',  entity: 'switch.spa_heater',  on: false },
      { label: 'Spa Pump Off',    entity: 'switch.spa_pump',    on: false },
      { label: 'Spillover Off',   entity: 'switch.spillover',   on: false },
      { label: 'Pool Heater Off', entity: 'switch.pool_heater', on: false },
      { label: 'Pool Pump Off',   entity: 'switch.pool_pump',   on: false },
      { label: 'Waterfall Off',   entity: 'switch.waterfall',   on: false },
    ],
  },

  start() {
    this._buildColorGrid();
    this.load();
    if (!this._pollInterval) {
      this._pollInterval = setInterval(() => this.load(), 10000);
    }
  },

  stop() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
  },

  _buildColorGrid() {
    const grid = document.getElementById('pool-color-grid');
    if (!grid || grid.children.length) return;
    this._LIGHT_EFFECTS.forEach(fx => {
      const btn = document.createElement('button');
      btn.className = 'pool-color-btn';
      btn.innerHTML = `<span class="pool-color-swatch" style="background:${fx.color}"></span>`
                    + `<span class="pool-color-name">${fx.name}</span>`;
      btn.onclick = () => this.applyColor(fx.name);
      grid.appendChild(btn);
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

      // Read-only indicators
      this._applyInd(d.pool_pump,   'pool-pump-ind',   'pool-pump-state');
      this._applyInd(d.pool_heater, 'pool-heater-ind', 'pool-heater-state');
      this._applyInd(d.spa_pump,    'spa-pump-ind',    'spa-pump-state');
      this._applyInd(d.spa_heater,  'spa-heater-ind',  'spa-heater-state');

      // Feature toggles
      this._applyToggle(d.spillover, 'pool-spillover-tog');
      this._applyToggle(d.waterfall, 'pool-waterfall-tog');
      this._applyToggle(d.light,     'pool-light-tog');

      const lightOn = d.light?.state === 'on';
      const effect  = lightOn ? (d.light?.attributes?.effect || '') : '';
      document.getElementById('pool-light-effect').textContent = effect;

      // Setpoints
      this._applySetpoint(d.pool_setpoint, 'pool');
      this._applySetpoint(d.spa_setpoint,  'spa');

      // Water quality
      const qmap = {
        'q-air-temp': d.air_temp, 'q-ph': d.ph, 'q-orp': d.orp,
        'q-pool-sal': d.salinity, 'q-spa-sal': d.spa_salinity,
      };
      Object.entries(qmap).forEach(([id, entity]) => {
        document.getElementById(id).textContent = this._goodVal(entity) ?? '--';
      });
    } catch { /* silent */ }
  },

  _applyInd(entity, indId, valId) {
    const on  = entity?.state === 'on';
    const ind = document.getElementById(indId);
    if (ind) ind.classList.toggle('on', on);
    const el  = document.getElementById(valId);
    if (el)  el.textContent = on ? 'ON' : 'OFF';
  },

  _applyToggle(entity, togId) {
    const tog = document.getElementById(togId);
    if (!tog) return;
    const on = entity?.state === 'on';
    tog.classList.toggle('active', on);
    tog.dataset.state = entity?.state || 'off';
  },

  _applySetpoint(entity, zone) {
    if (!entity) return;
    this._setpoints[zone] = entity.attributes?.temperature ?? this._setpoints[zone];
    const el = document.getElementById(`${zone}-setpoint-val`);
    if (el) el.textContent = `${this._setpoints[zone]}°F`;
  },

  // ── Preset modes ──────────────────────────────────────────────────────────

  async activatePreset(mode) {
    if (Date.now() < this._cdEnd) return;

    const steps = this._PRESETS[mode];
    const wrap  = document.getElementById('pool-action-wrap');
    const log   = document.getElementById('pool-action-log');
    wrap.classList.remove('hidden');
    log.innerHTML = '';
    ['pool', 'spa', 'off'].forEach(m => {
      document.getElementById(`preset-${m}`).disabled = true;
    });

    for (const step of steps) {
      const row = document.createElement('div');
      row.className = 'pool-action-row';
      row.innerHTML = `<span class="pool-action-dot">⏳</span><span>${step.label}</span>`;
      log.appendChild(row);
      await new Promise(r => setTimeout(r, 1000));
      try {
        await API.post('/api/pool/switch', { entity_id: step.entity, on: step.on });
        row.classList.add('done');
        row.querySelector('.pool-action-dot').textContent = '✓';
      } catch {
        row.classList.add('error');
        row.querySelector('.pool-action-dot').textContent = '✗';
      }
    }

    this._startCooldown(180);
    setTimeout(() => this.load(), 500);
  },

  _startCooldown(seconds) {
    this._cdEnd   = Date.now() + seconds * 1000;
    this._cdTotal = seconds * 1000;
    const cdWrap  = document.getElementById('pool-cooldown-wrap');
    const ring    = document.getElementById('pool-cd-ring');
    cdWrap.classList.remove('hidden');

    const CIRC = 2 * Math.PI * 34;
    ring.style.strokeDasharray  = CIRC;
    ring.style.strokeDashoffset = CIRC;

    const tick = () => {
      const remaining = Math.max(0, this._cdEnd - Date.now());
      ring.style.strokeDashoffset = CIRC * (remaining / this._cdTotal);
      const secs = Math.ceil(remaining / 1000);
      document.getElementById('pool-cd-text').textContent =
        `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      if (remaining <= 0) {
        clearInterval(this._cdInterval);
        this._cdInterval = null;
        cdWrap.classList.add('hidden');
        ['pool', 'spa', 'off'].forEach(m => {
          document.getElementById(`preset-${m}`).disabled = false;
        });
      }
    };
    if (this._cdInterval) clearInterval(this._cdInterval);
    this._cdInterval = setInterval(tick, 250);
    tick();
  },

  // ── Feature switches ──────────────────────────────────────────────────────

  async toggleFeature(entityId, togId) {
    const tog = document.getElementById(togId);
    const on  = tog?.dataset.state === 'on';
    try {
      await API.post('/api/pool/switch', { entity_id: entityId, on: !on });
      tog.classList.toggle('active', !on);
      tog.dataset.state = !on ? 'on' : 'off';
      setTimeout(() => this.load(), 800);
    } catch { Toast.show('Failed'); }
  },

  handleLight() {
    const tog = document.getElementById('pool-light-tog');
    if (tog?.dataset.state === 'on') {
      this._lightOff();
    } else {
      document.getElementById('pool-color-overlay').classList.remove('hidden');
    }
  },

  async _lightOff() {
    try {
      await API.post('/api/pool/light', { on: false });
      const tog = document.getElementById('pool-light-tog');
      tog.classList.remove('active');
      tog.dataset.state = 'off';
      document.getElementById('pool-light-effect').textContent = '';
      setTimeout(() => this.load(), 800);
    } catch { Toast.show('Failed'); }
  },

  async applyColor(effect) {
    document.getElementById('pool-color-overlay').classList.add('hidden');
    try {
      await API.post('/api/pool/light', { effect });
      const tog = document.getElementById('pool-light-tog');
      tog.classList.add('active');
      tog.dataset.state = 'on';
      document.getElementById('pool-light-effect').textContent = effect;
      setTimeout(() => this.load(), 800);
    } catch { Toast.show('Failed'); }
  },

  cancelColor() {
    document.getElementById('pool-color-overlay').classList.add('hidden');
  },

  // ── Water Quality panel ───────────────────────────────────────────────────

  showQuality()  { document.getElementById('pool-quality-overlay').classList.remove('hidden'); },
  hideQuality()  { document.getElementById('pool-quality-overlay').classList.add('hidden'); },

  // ── Temperature setpoint ──────────────────────────────────────────────────

  async adjustTemp(entityId, zone, delta) {
    const cur  = this._setpoints[zone];
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

/* ── Completion Store ────────────────────────────────────────────────────── */
/**
 * localStorage-backed record of when tasks were marked complete.
 * Allows "show today's completions" without requiring HA to store dates.
 * Key: "cs:{entityId}:{uid}"  Value: ISO date "YYYY-MM-DD"
 */
const CompletionStore = {
  _k(entityId, uid)       { return `cs:${entityId}:${uid}`; },
  _today()                { return new Date().toISOString().slice(0, 10); },

  set(entityId, uid, completed) {
    const k = this._k(entityId, uid);
    if (completed) localStorage.setItem(k, this._today());
    else           localStorage.removeItem(k);
  },

  isCompletedToday(entityId, uid) {
    return localStorage.getItem(this._k(entityId, uid)) === this._today();
  },

  hasAnyToday(entityId) {
    const prefix = `cs:${entityId}:`;
    const today  = this._today();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && localStorage.getItem(k) === today) return true;
    }
    return false;
  },
};

/* ── Shared Helpers ─────────────────────────────────────────────────────── */

/** Format a Date as YYYY-MM-DD in the device's local timezone. */
function _localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Fetch pending tasks for all lists in parallel; failed lists return []. */
async function _fetchPendingTasks(lists) {
  return Promise.all(
    lists.map(lst =>
      API.get(`/api/lists/${encodeURIComponent(lst.id)}/tasks?completed=false`)
         .catch(() => [])
    )
  );
}

/**
 * Build HTML for event bullet rows inside a calendar day cell.
 * Shows up to MAX titled bullets; appends "+N" if more exist.
 */
function _buildDayBulletsHtml(evs) {
  if (!evs.length) return '';
  const MAX  = 3;
  const more = evs.length - MAX;
  const rows = evs.slice(0, MAX).map(ev =>
    `<div class="cal-day-bullet">` +
    `<span class="cal-day-bullet-dot" style="color:${ev.color || 'var(--accent)'}">•</span>` +
    `${esc(ev.title)}</div>`
  );
  if (more > 0) rows.push(`<div class="cal-day-bullet-more">+${more} more</div>`);
  return `<div class="cal-day-bullets">${rows.join('')}</div>`;
}

/* ── Long Press Utility ─────────────────────────────────────────────────── */
function addLongPress(el, onTap, onLongPress, delay = 450) {
  let timer = null;
  let triggered = false;
  let touchActive = false;

  const start = (e) => {
    if (e.type === 'mousedown' && touchActive) return;
    if (timer !== null) return;
    e.preventDefault();
    triggered = false;
    if (e.type === 'touchstart') touchActive = true;
    timer = setTimeout(() => {
      triggered = true;
      timer = null;
      onLongPress();
    }, delay);
  };

  const cancel = (e) => {
    if (e && e.type === 'mouseleave' && touchActive) return;
    clearTimeout(timer);
    timer = null;
  };

  const end = (e) => {
    if (e.type === 'mouseup' && touchActive) return;
    clearTimeout(timer);
    timer = null;
    if (!triggered) onTap();
    if (e.type === 'touchend' || e.type === 'touchcancel') {
      setTimeout(() => { touchActive = false; }, 300);
    }
  };

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', cancel);
}

/* ── Admin Menu (Home + Pool simultaneous press) ────────────────────────── */
const AdminUI = {
  _comboFired: false,
  _held: new Set(),

  init() {
    const home = document.querySelector('[data-screen="dashboard"]');
    const pool = document.querySelector('[data-screen="pool"]');

    [home, pool].forEach(btn => {
      const id = btn.dataset.screen;
      btn.addEventListener('touchstart', () => {
        this._held.add(id);
        if (this._held.has('dashboard') && this._held.has('pool')) {
          this._comboFired = true;
          this.show();
        }
      }, { passive: true });
      btn.addEventListener('touchend',    () => this._held.delete(id));
      btn.addEventListener('touchcancel', () => this._held.delete(id));
    });
  },

  show() {
    document.getElementById('admin-overlay').classList.remove('hidden');
  },

  hide() {
    document.getElementById('admin-overlay').classList.add('hidden');
    this._comboFired = false;
  },

  async refresh() {
    this.hide();
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    window.location.reload(true);
  },

  async reboot() {
    document.getElementById('admin-btn-reboot').textContent = 'Rebooting…';
    document.getElementById('admin-btn-reboot').disabled = true;
    try {
      await fetch('http://localhost:7070/reboot');
    } catch {
      // Expected — connection drops immediately on reboot
    }
  },
};

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

/* ── Virtual Keyboard ───────────────────────────────────────────────────── */
const VirtualKeyboard = {
  _el: null,
  _target: null,
  _shift: false,
  _num: false,

  _alphaRows: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','DEL'],
    ['?123',' ','DONE'],
  ],
  _numRows: [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['-','/','.', ',','?','!','"','\'','(',')',],
    ['@','#','$','%','&','*','=','+','_','DEL'],
    ['ABC',' ','DONE'],
  ],

  init() {
    this._el = document.getElementById('vkb');

    document.addEventListener('focusin', (e) => {
      const t = e.target;
      const isText = (t.tagName === 'INPUT' && t.type !== 'date' && t.type !== 'checkbox' && t.type !== 'range')
                  || t.tagName === 'TEXTAREA';
      if (isText) { this._target = t; this._show(); }
    });

    document.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!this._el.contains(document.activeElement) && document.activeElement !== this._target) {
          this._hide();
        }
      }, 200);
    });
  },

  _show() {
    this._render();
    this._el.classList.remove('hidden');
    const box = document.getElementById('modal-box');
    if (box) {
      box.style.paddingBottom = (this._el.offsetHeight + 8) + 'px';
      setTimeout(() => this._target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
  },

  _hide() {
    this._el.classList.add('hidden');
    this._target = null;
    const box = document.getElementById('modal-box');
    if (box) box.style.paddingBottom = '';
  },

  _render() {
    const rows = this._num ? this._numRows : this._alphaRows;
    this._el.innerHTML = '';
    rows.forEach((row, ri) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkb-row';
      if (!this._num && ri === 1) {
        const sp = document.createElement('div'); sp.style.flex = '0.5'; rowEl.appendChild(sp);
      }
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const special = ['SHIFT','DEL','DONE','?123','ABC'].includes(key);
        let label = key === ' ' ? 'space' : (special ? key : (this._shift ? key.toUpperCase() : key));
        btn.textContent = label;
        btn.className = 'vkb-key' + (special || key === ' ' ? '' : '');
        if (special) btn.classList.add('vkb-special');
        if (key === ' ') btn.classList.add('vkb-space');
        if (key === 'SHIFT' && this._shift) btn.classList.add('vkb-shift-active');
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); this._press(key); });
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); this._press(key); }, { passive: false });
        rowEl.appendChild(btn);
      });
      if (!this._num && ri === 1) {
        const sp = document.createElement('div'); sp.style.flex = '0.5'; rowEl.appendChild(sp);
      }
      this._el.appendChild(rowEl);
    });
  },

  _press(key) {
    if (key === 'SHIFT') { this._shift = !this._shift; this._render(); return; }
    if (key === '?123') { this._num = true; this._render(); return; }
    if (key === 'ABC') { this._num = false; this._render(); return; }
    if (!this._target) return;
    if (key === 'DEL') {
      const s = this._target.selectionStart, e = this._target.selectionEnd;
      if (s !== e) { this._insert(''); }
      else if (s > 0) {
        const v = this._target.value;
        this._target.value = v.slice(0, s - 1) + v.slice(s);
        this._target.setSelectionRange(s - 1, s - 1);
      }
    } else if (key === 'DONE') {
      this._target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      const ch = key === ' ' ? ' ' : (this._shift ? key.toUpperCase() : key);
      this._insert(ch);
      if (this._shift && key !== ' ' && key !== 'DONE') { this._shift = false; this._render(); return; }
    }
    this._target.dispatchEvent(new Event('input', { bubbles: true }));
    this._target.focus();
  },

  _insert(text) {
    const t = this._target;
    const s = t.selectionStart, e = t.selectionEnd;
    t.value = t.value.slice(0, s) + text + t.value.slice(e);
    t.setSelectionRange(s + text.length, s + text.length);
  },
};

/* ── Mobile viewport height fix ─────────────────────────────────────────── */
// window.innerHeight is the actual visible height on mobile (excludes browser
// chrome). We write it as --vh so CSS can use calc(var(--vh) * 100) if needed,
// but mainly we rely on position:fixed which references the visual viewport.
function _setVh() {
  document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
}
window.addEventListener('resize', _setVh);
_setVh();

/* ── Init ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 10000);
  updateOnlineStatus();

  // Load server config (camera on/off, title) then render dashboard
  await App.loadConfig();
  GarageUI.init();
  GateUI.init();
  AdminUI.init();
  VirtualKeyboard.init();
  DashUI.refresh();

  // Refresh dashboard every 5 minutes while on it
  setInterval(() => {
    if (App.current === 'dashboard') DashUI.refresh();
  }, 300000);
});
