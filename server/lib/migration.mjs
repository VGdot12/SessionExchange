import { gzipSync, gunzipSync } from 'node:zlib';
import { emptyDocument, hash, Problem, validateCatalogue } from './model.mjs';

export function migrationStatus(d) {
  return { ok: true, frozen: d.migration?.frozen === true, restored: !!d.migration?.restored_checksum,
    sessions: d.sessions.length, students: d.students.length, requests: d.requests.length,
    accepted: d.requests.filter(r => r.status === 'ACCEPTED').length };
}

export function freezeForMigration(d, now = Date.now()) {
  d.migration = { ...d.migration, frozen: true, frozen_at: new Date(now).toISOString() };
  return migrationStatus(d);
}

export function activateAfterMigration(d) {
  d.migration = { ...d.migration, frozen: false };
  return migrationStatus(d);
}

export function exportBackup(d, now = Date.now()) {
  if (!d.migration?.frozen) throw new Problem('Pause the old board before downloading a final backup.', 409);
  const document = structuredClone(d);
  // Sessions on the old hostname must never be reusable on the new hostname.
  document.logins = []; document.attempts = [];
  if (document.outlook) document.outlook.lease = null;
  const backup = { format: 'sessionexchange-backup-v1', exported_at: new Date(now).toISOString(),
    checksum: hash(JSON.stringify(document)), document };
  return gzipSync(Buffer.from(JSON.stringify(backup)));
}

export function restoreBackup(d, payload, now = Date.now()) {
  const encoded = payload.backup_gzip_base64;
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 4_200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Problem('Choose a valid compressed backup smaller than 3 MB.');
  let backup;
  try { backup = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 8_500_000 }).toString('utf8')); }
  catch { throw new Problem('The backup could not be read. Choose the .json.gz file downloaded from the old site.'); }
  const original = backup?.document;
  if (backup.format !== 'sessionexchange-backup-v1' || original?.schema !== 1 || typeof backup.checksum !== 'string' || backup.checksum !== hash(JSON.stringify(original))) throw new Problem('The backup format or integrity check is invalid.');
  for (const key of ['students', 'sessions', 'assignments', 'requests', 'logins', 'attempts']) {
    if (!Array.isArray(original[key]) || original[key].some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Problem('The backup has invalid record collections.');
  }
  if (typeof original.demo !== 'boolean' || !original.metadata || typeof original.metadata !== 'object' || Array.isArray(original.metadata)) throw new Problem('The backup metadata is invalid.');
  // Historic inactive entries may share a course/section with their replacement.
  // Validate each record without imposing new-catalogue uniqueness on history.
  for (const { id, ...s } of original.sessions) validateCatalogue({ sessions: [{ session_id: id, ...s }] });
  const ids = new Set(original.sessions.map(s => s.id)), students = new Set(original.students.map(s => s.pgid));
  if (ids.size !== original.sessions.length) throw new Problem('The backup has duplicate session IDs.');
  if (students.size !== original.students.length || original.students.some(s => typeof s.pgid !== 'string' || typeof s.name !== 'string')) throw new Problem('The backup has invalid student records.');
  if (original.requests.some(r => !['OPEN','ACCEPTED','CANCELLED','EXPIRED'].includes(r.status) || typeof r.id !== 'string' || !ids.has(r.offered_id) || (r.desired_id && !ids.has(r.desired_id)) || !students.has(r.poster_pgid))) throw new Problem('The backup has invalid request references.');
  if (original.assignments.some(a => !students.has(a.pgid) || !ids.has(a.source_session_id) || !ids.has(a.current_session_id))) throw new Problem('The backup has invalid assignment references.');
  if (d.migration?.restored_checksum === backup.checksum) return { ...migrationStatus(d), duplicate: true };
  if ([d.students, d.sessions, d.assignments, d.requests].some(rows => rows.length)) throw new Problem('Restore is only allowed into an empty board. Existing data was not overwritten.', 409);
  const restored = emptyDocument();
  for (const key of ['demo','students','sessions','assignments','requests','metadata','outlook','catalogueUpload']) {
    if (Object.hasOwn(original, key)) restored[key] = structuredClone(original[key]);
  }
  restored.migration = { frozen: true, restored_checksum: backup.checksum, restored_at: new Date(now).toISOString() };
  Object.assign(d, restored);
  return migrationStatus(d);
}
