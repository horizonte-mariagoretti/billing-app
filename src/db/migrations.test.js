// Run: node --test src/db/migrations.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { runMigrations, LATEST_SCHEMA_VERSION } from './migrations.js';

const adapterFor = (db) => ({
  exec: (sql) => db.exec(sql),
  hasVersionRow: () => db.exec('SELECT version FROM schema_version')[0]?.values.length > 0,
  insertVersionRow: () => db.run('INSERT INTO schema_version (version) VALUES (0)'),
  getVersion: () => db.exec('SELECT version FROM schema_version')[0].values[0][0],
  setVersion: (v) => db.run('UPDATE schema_version SET version = ?', [v]),
});

test('migrations build a fresh database to the latest version, and rerun is a no-op', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const a = adapterFor(db);
  runMigrations(a);
  assert.equal(a.getVersion(), LATEST_SCHEMA_VERSION);
  assert.ok(LATEST_SCHEMA_VERSION >= 54);
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.flat();
  assert.ok(tables.some((n) => n.startsWith('baseball')), 'baseball tables exist');
  runMigrations(a);
  assert.equal(a.getVersion(), LATEST_SCHEMA_VERSION);
});
