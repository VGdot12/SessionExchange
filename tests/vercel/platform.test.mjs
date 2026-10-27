import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PostgresStore, SQL, neonConnection } from '../../server/lib/postgres-store.mjs';
import { siteRepository, namespaceFor } from '../../server/lib/vercel-storage.mjs';
import { makeVercelEntry } from '../../server/lib/vercel-entry.mjs';
import { Repository } from '../../server/lib/repository.mjs';
import { seedDocument, emptyDocument, login, createRequest, acceptRequest } from '../../server/lib/model.mjs';
import { freezeForMigration, exportBackup, restoreBackup, activateAfterMigration } from '../../server/lib/migration.mjs';
import { deliverCatalogue, catalogueEndpoint } from '../../scripts/deliver-catalogue.mjs';

const DB = 'postgresql://owner:PRIVATE_PASSWORD@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
const ADMIN = 'admin-123456789012345678901234567890123456';
const FLOW = 'flow-123456789012345678901234567890123456';
const SITE = 'https://exchange-example.vercel.app';
const env = { DATABASE_URL: DB, VERCEL_ENV: 'production', SWAP_EXCEL_UPLOAD_ENABLED: '1', SWAP_FLOW_TOKEN: FLOW, SWAP_ADMIN_TOKEN: ADMIN, SWAP_MIGRATION_ENABLED: '1' };

// Simulate the PostgreSQL HTTP protocol and statement-level conditional updates.
// Independent cold handlers share only this database, never JS object references.
class Neon {
  rows = new Map(); queries = []; conflicts = 0;
  fetch = async (url, options) => {
    assert.equal(url, 'https://api.us-east-2.aws.neon.tech/sql');
    assert.equal(options.headers['Neon-Connection-String'], DB); assert.equal(options.redirect, 'error');
    const { query, params } = JSON.parse(options.body); this.queries.push({ query, params });
    await new Promise(r => setImmediate(r));
    if (query === SQL.create) return Response.json({ rows: [] });
    const [key, text, revision] = params, old = this.rows.get(key);
    if (query === SQL.read) return Response.json({ rows: old ? [{ document: JSON.stringify(old), etag: old.revision }] : [] });
    if (query === SQL.init || query === SQL.update) {
      if ((query === SQL.init && old) || (query === SQL.update && (!old || old.revision !== revision))) { this.conflicts++; return Response.json({ rows: [] }); }
      const next = JSON.parse(text); this.rows.set(key, next); return Response.json({ rows: [{ etag: next.revision }] });
    }
    throw new Error('Unexpected SQL statement');
  };
}
function request(path, data, cookie = '', token) {
  return new Request(SITE + '/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: {
    'Content-Type': 'application/json', 'X-Swap-Request': '1', cookie, ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
const backupPayload = d => ({ backup_gzip_base64: exportBackup(d).toString('base64') });

test('Neon queries use bound parameters and CAS; cold concurrent handlers cannot accept a swap twice', async () => {
  const neon = new Neon();
  const repo = new Repository(new PostgresStore({ connectionString: DB, namespace: namespaceFor(env), fetcher: neon.fetch }), seedDocument);
  const serve = makeVercelEntry({ env, repository: repo });
  async function signin(pgid, name) {
    const r = await serve(request('login', { pgid, name })); assert.equal(r.status, 200);
    return r.headers.get('set-cookie').split(';')[0];
  }
  const poster = await signin('90001', "Name'); DROP TABLE state;--"), a = await signin('90002', 'Acceptor A'), b = await signin('90003', 'Acceptor B');
  const created = await serve(request('requests', { offered_id: 'STR-A', desired_id: 'DAT-A' }, poster));
  const { id } = await created.json();
  const cold = makeVercelEntry({ env, fetcher: neon.fetch });
  const results = await Promise.all([serve(request(`requests/${id}/accept`, { accepted_session_id: 'DAT-A' }, a)), cold(request(`requests/${id}/accept`, { accepted_session_id: 'DAT-A' }, b))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.ok(neon.conflicts > 0);
  const d = (await repo.read()).data;
  assert.equal(d.requests.filter(r => r.id === id && r.status === 'ACCEPTED').length, 1);
  assert.ok(neon.queries.every(q => !q.query.includes('DROP TABLE state')));
  assert.match(SQL.update, /WHERE namespace = \$1 AND document->>'revision' = \$3/);
});

test('Vercel route rewrites preserve POST bodies and cookies and health confirms the real store', async () => {
  const neon = new Neon(), serve = makeVercelEntry({ env: { ...env, SWAP_MIGRATION_ENABLED: '0' }, fetcher: neon.fetch });
  const health = await serve(new Request(SITE + '/api/index?__swap_route=health'));
  assert.deepEqual(await health.json(), { ok: true, runtime: 'vercel-functions', storage: 'neon-postgres' });
  const r = await serve(new Request(SITE + '/api/index?__swap_route=login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Swap-Request': '1' }, body: JSON.stringify({ pgid: '90001', name: 'Student' }) }));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const state = await serve(request('state', undefined, r.headers.get('set-cookie').split(';')[0]));
  assert.equal((await state.json()).user.pgid, '90001');
});

test('production is stable across redeploys; previews have separate state and cannot import or restore', async () => {
  assert.equal(namespaceFor(env), namespaceFor({ ...env, VERCEL_URL: 'different.vercel.app' }));
  assert.notEqual(namespaceFor(env), namespaceFor({ ...env, VERCEL_ENV: 'preview' }));
  assert.notEqual(namespaceFor({ VERCEL_URL: 'one' }), namespaceFor({ VERCEL_URL: 'two' }));
  const neon = new Neon(), serve = makeVercelEntry({ env: { ...env, VERCEL_ENV: 'preview' }, fetcher: neon.fetch });
  assert.equal((await serve(request('admin/migration/status', undefined, '', ADMIN))).status, 403);
  assert.equal((await serve(request('integrations/catalogue', undefined, '', FLOW))).status, 403);
  assert.equal(neon.rows.size, 0);
});

test('missing or unsafe database URLs and failed database responses never disclose credentials', async () => {
  for (const value of ['', 'https://example.test/db', 'postgresql://a:b@evil.test/db']) assert.throws(() => neonConnection(value));
  const store = new PostgresStore({ connectionString: DB, namespace: 'test', fetcher: async () => new Response('PRIVATE_PASSWORD', { status: 401 }) });
  await assert.rejects(store.getWithMetadata('state'), e => !e.message.includes('PRIVATE_PASSWORD') && e.status === 503);
  const r = await makeVercelEntry({ env: {} })(request('health'));
  assert.equal(r.status, 503); assert.match((await r.json()).error, /DATABASE_URL/);
});

test('fresh transfer-enabled boards stay paused, and admin authentication is separate from Excel delivery', async () => {
  const neon = new Neon(), serve = makeVercelEntry({ env, fetcher: neon.fetch });
  assert.equal((await serve(request('health'))).status, 200);
  assert.equal((await serve(request('login', { pgid: '90001', name: 'Student' }))).status, 503);
  assert.equal((await serve(request('admin/migration/status', undefined, '', FLOW))).status, 403);
  const status = await serve(request('admin/migration/status', undefined, '', ADMIN)); assert.equal((await status.json()).frozen, true);
  assert.equal((await serve(request('admin/migration/activate', {}, '', ADMIN))).status, 200);
  assert.equal((await serve(request('login', { pgid: '90001', name: 'Student' }))).status, 200);
});

test('freeze/export/restore retains accepted snapshots, open requests and IDs while ending old login sessions', async () => {
  const old = seedDocument(), now = Date.now();
  login(old, { pgid: '90001', name: 'Poster' }); login(old, { pgid: '90002', name: 'Acceptor' });
  const id = createRequest(old, '90001', { offered_id: 'STR-A', desired_id: 'DAT-A' }, now);
  acceptRequest(old, '90002', id, 'DAT-A', now);
  freezeForMigration(old);
  const before = structuredClone(old.requests), payload = backupPayload(old);
  const neon = new Neon(), serve = makeVercelEntry({ env, fetcher: neon.fetch });
  const restored = await serve(request('admin/migration/restore', payload, '', ADMIN));
  assert.equal(restored.status, 200); assert.equal((await restored.json()).accepted, old.requests.filter(r => r.status === 'ACCEPTED').length);
  const repo = siteRepository(env, neon.fetch), after = (await repo.read()).data;
  assert.deepEqual(after.requests, before); assert.deepEqual(after.assignments, old.assignments); assert.deepEqual(after.sessions, old.sessions);
  assert.deepEqual(after.students, old.students); assert.deepEqual(after.logins, []); assert.equal(after.migration.frozen, true);
  const repeated = await serve(request('admin/migration/restore', payload, '', ADMIN));
  assert.equal((await repeated.json()).duplicate, true);
  assert.equal((await serve(request('admin/migration/activate', {}, '', ADMIN))).status, 200);
  assert.equal((await serve(request('login', { pgid: '90001', name: 'Poster' }))).status, 200);
});

test('frozen stores reject every normal mutation, including callers that read before the freeze', async () => {
  const neon = new Neon(), repo = siteRepository({ ...env, SWAP_MIGRATION_ENABLED: '0' }, neon.fetch);
  await repo.read();
  await repo.mutate(d => freezeForMigration(d), { allowFrozen: true });
  await assert.rejects(repo.mutate(d => { d.metadata.changed = true; }), e => e.status === 503);
  const saved = (await repo.read()).data; assert.equal(saved.metadata.changed, undefined);
  const file = exportBackup(saved); assert.equal(JSON.parse(gunzipSync(file)).document.migration.frozen, true);
});

test('restore rejects corrupt backups and refuses to overwrite a nonempty destination atomically', () => {
  const source = seedDocument(); freezeForMigration(source); const payload = backupPayload(source);
  const target = seedDocument(), original = structuredClone(target);
  assert.throws(() => restoreBackup(target, payload), e => e.status === 409);
  assert.deepEqual(target, original);
  const backup = JSON.parse(gunzipSync(Buffer.from(payload.backup_gzip_base64, 'base64'))); backup.document.students[0].name = 'Tampered';
  assert.throws(() => restoreBackup(emptyDocument(), { backup_gzip_base64: gzipSync(JSON.stringify(backup)).toString('base64') }));
  assert.throws(() => restoreBackup(emptyDocument(), { backup_gzip_base64: 'wrong' }));
});

test('inactive historical events can share a grouping with their replacement and still transfer', () => {
  const source = seedDocument();
  const replacement = { ...source.sessions[0], id: 'replacement-id', active: 1 };
  source.sessions[0].active = 0; source.sessions.push(replacement);
  freezeForMigration(source);
  const target = emptyDocument();
  restoreBackup(target, backupPayload(source));
  assert.deepEqual(target.sessions, source.sessions);
  assert.equal(target.sessions[0].active, 0);
});

test('a write already in flight loses its stale revision race to freeze and cannot commit afterwards', async () => {
  const neon = new Neon(); let release, reached;
  const waiting = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let held = false;
  const fetcher = async (url, options) => {
    const { query, params } = JSON.parse(options.body);
    if (!held && query === SQL.update && JSON.parse(params[1]).metadata.late) {
      held = true; reached(); await gate;
    }
    return neon.fetch(url, options);
  };
  const repo = siteRepository({ ...env, SWAP_MIGRATION_ENABLED: '0' }, fetcher);
  await repo.read();
  const writer = repo.mutate(d => { d.metadata.late = true; });
  const rejected = assert.rejects(writer, e => e.status === 503);
  await waiting;
  await repo.mutate(d => freezeForMigration(d), { allowFrozen: true });
  release(); await rejected;
  assert.equal((await repo.read()).data.metadata.late, undefined);
});

test('delivery requires an explicit production origin and can pass Vercel automation protection', async () => {
  for (const url of ['', 'http://example.vercel.app', SITE + '/admin', 'https://name:secret@example.vercel.app', 'https://sessionexchange.netlify.app']) assert.throws(() => catalogueEndpoint(url));
  const result = await deliverCatalogue({ siteURL: SITE, token: FLOW, check: true, bypassSecret: 'automation-secret', fetcher: async (url, options) => {
    assert.equal(url, SITE + '/api/integrations/catalogue'); assert.equal(options.headers['x-vercel-protection-bypass'], 'automation-secret');
    assert.equal(options.redirect, 'error'); return Response.json({ ok: true, ready: true });
  } });
  assert.equal(result.ready, true);
});
