// In-browser SQLite engine wrapping sql.js (WASM build).
// Mirrors the public surface of window.appDb so useDatabase.js — and
// every hook/page that uses it — keeps working without a code change.
//
// Boot order (web target):
//   1. Bootstrap fetches DB bytes from GitHub.
//   2. Calls init(bytes).
//   3. Calls runMigrations(...).
//   4. Calls installDbBridge() — overrides window.appDb so the
//      existing useDatabase.js binds to this engine.
//   5. App mounts and runs as normal.

import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { runMigrations } from './migrations.js';

let SQL = null;
let db = null;
let dirty = false;
const listeners = new Set();

// sql.js ships as UMD; ESM interop varies across bundlers (dev = vite
// pre-bundle, prod = rolldown). Drill through possible nestings to find the
// init function.
async function loadSqlJs() {
  const mod = await import('sql.js');
  const visited = new Set();
  const stack = [mod];
  while (stack.length) {
    const node = stack.pop();
    if (!node || visited.has(node)) continue;
    visited.add(node);
    if (typeof node === 'function') return node;
    if (typeof node.initSqlJs === 'function') return node.initSqlJs;
    if (typeof node.default === 'function') return node.default;
    if (node.default && typeof node.default === 'object') stack.push(node.default);
  }
  throw new Error('sql.js init function not found in module exports — got keys: ' + Object.keys(mod).join(','));
}

function emit(event, payload) {
  for (const fn of listeners) {
    try { fn(event, payload); } catch (_e) { /* listener errors don't break engine */ }
  }
}

export async function init(bytes) {
  if (!SQL) {
    const initSqlJs = await loadSqlJs();
    SQL = await initSqlJs({ locateFile: () => wasmUrl });
  }
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  dirty = false;
}

function ensureReady() {
  if (!db) throw new Error('sqliteEngine not initialised — call init() first');
}

function bindAndStep(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function query(sql, params = []) {
  ensureReady();
  return bindAndStep(sql, params);
}

export function run(sql, params = []) {
  ensureReady();
  const stmt = db.prepare(sql);
  try {
    if (params && params.length) stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
  const changes = db.getRowsModified();
  let lastInsertRowid = 0;
  try {
    const r = bindAndStep('SELECT last_insert_rowid() AS id', []);
    lastInsertRowid = r[0]?.id ?? 0;
  } catch { /* already applied */ }
  if (changes > 0) {
    dirty = true;
    emit('mutation', { sql });
  }
  return { changes, lastInsertRowid };
}

export function transaction(ops) {
  ensureReady();
  db.exec('BEGIN');
  const results = [];
  try {
    for (const op of ops) {
      results.push(run(op.sql, op.params || []));
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already applied */ }
    throw e;
  }
  return results;
}

export function exportBytes() {
  ensureReady();
  return db.export();
}

export function isDirty() { return dirty; }
export function markClean() { dirty = false; }

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Migration adapter — bridges runMigrations() to this engine.
function makeAdapter() {
  return {
    exec: (sql) => db.exec(sql),
    hasVersionRow: () => {
      const r = bindAndStep('SELECT version FROM schema_version', []);
      return r.length > 0;
    },
    insertVersionRow: () => { db.run('INSERT INTO schema_version (version) VALUES (0)'); },
    getVersion: () => {
      const r = bindAndStep('SELECT version FROM schema_version', []);
      return r[0]?.version ?? 0;
    },
    setVersion: (v) => { db.run('UPDATE schema_version SET version = ?', [v]); },
  };
}

export function migrate() {
  ensureReady();
  runMigrations(makeAdapter());
  // Migrations are not user data mutations, but they change the DB content,
  // so flag dirty so the first sync push includes the schema upgrade.
  dirty = true;
  emit('mutation', { sql: '<migration>' });
}

// Bind window.appDb to this engine. The existing useDatabase.js calls
// window.appDb.{query,run,transaction} as async; we wrap our sync
// implementations to match that contract.
export function installDbBridge() {
  window.appDb = {
    query: async (sql, params) => query(sql, params),
    run: async (sql, params) => run(sql, params),
    transaction: async (ops) => transaction(ops),
  };
}
