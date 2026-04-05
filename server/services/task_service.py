import sqlite3
import os
from datetime import datetime
from config import DATABASE_PATH


def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS task_lists (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT    NOT NULL,
            color   TEXT    NOT NULL DEFAULT '#4ecdc4',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id     INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
            title       TEXT    NOT NULL,
            completed   INTEGER NOT NULL DEFAULT 0,
            due_date    TEXT,
            position    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);

        -- Seed default lists if none exist
        INSERT OR IGNORE INTO task_lists(id, name, color, position)
        SELECT 1, 'Shopping', '#ff6b6b', 0
        WHERE NOT EXISTS (SELECT 1 FROM task_lists);

        INSERT OR IGNORE INTO task_lists(id, name, color, position)
        SELECT 2, 'Home', '#4ecdc4', 1
        WHERE NOT EXISTS (SELECT 1 FROM task_lists WHERE id = 2);

        INSERT OR IGNORE INTO task_lists(id, name, color, position)
        SELECT 3, 'Work', '#45b7d1', 2
        WHERE NOT EXISTS (SELECT 1 FROM task_lists WHERE id = 3);
    """)
    conn.commit()
    conn.close()


# ── Task Lists ──────────────────────────────────────────────────────────────

def get_lists():
    conn = get_db()
    rows = conn.execute("""
        SELECT tl.*, COUNT(t.id) as total,
               SUM(CASE WHEN t.completed = 0 THEN 1 ELSE 0 END) as pending
        FROM task_lists tl
        LEFT JOIN tasks t ON t.list_id = tl.id
        GROUP BY tl.id
        ORDER BY tl.position, tl.id
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_list(name, color='#4ecdc4'):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO task_lists(name, color, position) VALUES (?, ?, (SELECT COALESCE(MAX(position)+1,0) FROM task_lists))",
        (name.strip(), color)
    )
    list_id = cur.lastrowid
    conn.commit()
    conn.close()
    return get_list(list_id)


def get_list(list_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM task_lists WHERE id = ?", (list_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_list(list_id, name=None, color=None):
    conn = get_db()
    if name is not None:
        conn.execute("UPDATE task_lists SET name = ? WHERE id = ?", (name.strip(), list_id))
    if color is not None:
        conn.execute("UPDATE task_lists SET color = ? WHERE id = ?", (color, list_id))
    conn.commit()
    conn.close()
    return get_list(list_id)


def delete_list(list_id):
    conn = get_db()
    conn.execute("DELETE FROM task_lists WHERE id = ?", (list_id,))
    conn.commit()
    conn.close()


# ── Tasks ────────────────────────────────────────────────────────────────────

def get_tasks(list_id, include_completed=True):
    conn = get_db()
    sql = "SELECT * FROM tasks WHERE list_id = ?"
    if not include_completed:
        sql += " AND completed = 0"
    sql += " ORDER BY completed, position, id"
    rows = conn.execute(sql, (list_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_task(list_id, title, due_date=None):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO tasks(list_id, title, due_date, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position)+1,0) FROM tasks WHERE list_id = ?))",
        (list_id, title.strip(), due_date, list_id)
    )
    task_id = cur.lastrowid
    conn.commit()
    conn.close()
    return get_task(task_id)


def get_task(task_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def toggle_task(task_id):
    conn = get_db()
    row = conn.execute("SELECT completed FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        return None
    new_state = 0 if row['completed'] else 1
    completed_at = datetime.now().isoformat() if new_state else None
    conn.execute(
        "UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?",
        (new_state, completed_at, task_id)
    )
    conn.commit()
    conn.close()
    return get_task(task_id)


def delete_task(task_id):
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


def get_all_pending_counts():
    conn = get_db()
    rows = conn.execute("""
        SELECT list_id, COUNT(*) as count
        FROM tasks WHERE completed = 0
        GROUP BY list_id
    """).fetchall()
    conn.close()
    return {r['list_id']: r['count'] for r in rows}
