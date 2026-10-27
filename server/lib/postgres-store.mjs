import { Problem } from './model.mjs';

// The same conditional-write contract as the original Netlify store. A primary
// Postgres UPDATE checks the revision and saves the entire state atomically.
export const SQL = {
  create: 'CREATE TABLE IF NOT EXISTS sessionexchange_state (namespace text PRIMARY KEY, document jsonb NOT NULL)',
  read: "SELECT document::text AS document, document->>'revision' AS etag FROM sessionexchange_state WHERE namespace = $1",
  init: "INSERT INTO sessionexchange_state (namespace, document) VALUES ($1, $2::jsonb) ON CONFLICT (namespace) DO NOTHING RETURNING document->>'revision' AS etag",
  update: "UPDATE sessionexchange_state SET document = $2::jsonb WHERE namespace = $1 AND document->>'revision' = $3 RETURNING document->>'revision' AS etag",
};
const failure = () => new Problem('The database is unavailable. Check the Vercel DATABASE_URL setting and Neon connection, then retry.', 503);

export function neonConnection(value) {
  let url;
  try { url = new URL(value); } catch { throw new Problem('Add a Neon DATABASE_URL in Vercel and redeploy.', 503); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password || url.pathname.length < 2 || /[\r\n]/.test(value)) throw new Problem('DATABASE_URL must be a complete Neon Postgres connection string.', 503);
  // This is Neon's documented SQL-over-HTTP endpoint, also used by its driver.
  return { endpoint: `https://${url.hostname.replace(/^[^.]+\./, 'api.')}/sql`, connectionString: value };
}

export class PostgresStore {
  constructor({ connectionString, namespace, fetcher = fetch }) {
    this.connection = neonConnection(connectionString); this.namespace = namespace; this.fetcher = fetcher; this.ready = null;
  }
  async query(query, params = []) {
    let response;
    try {
      response = await this.fetcher(this.connection.endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': this.connection.connectionString, 'Neon-Raw-Text-Output': 'true' },
        body: JSON.stringify({ query, params }) });
      if (!response.ok) { await response.body?.cancel(); throw failure(); }
      const reader = response.body?.getReader(), chunks = []; let length = 0;
      if (!reader) throw failure();
      while (true) { const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength; if (length > 20_000_000) { await reader.cancel(); throw failure(); } chunks.push(Buffer.from(value)); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result.error || !Array.isArray(result.rows)) throw failure();
      return result.rows;
    } catch { throw failure(); }
  }
  async ensureTable() {
    if (!this.ready) this.ready = this.query(SQL.create).catch(error => { this.ready = null; throw error; });
    await this.ready;
  }
  async getWithMetadata(key) {
    await this.ensureTable();
    const rows = await this.query(SQL.read, [`${this.namespace}/${key}`]);
    if (!rows.length) return null;
    try {
      const data = JSON.parse(rows[0].document), etag = rows[0].etag;
      if (typeof etag !== 'string' || !etag || data.revision !== etag) throw failure();
      return { data, etag };
    } catch { throw failure(); }
  }
  async setJSON(key, value, options) {
    await this.ensureTable();
    if (!options.onlyIfNew && !options.onlyIfMatch) throw new Error('An atomic write condition is required.');
    const params = [`${this.namespace}/${key}`, JSON.stringify(value)];
    const rows = await this.query(options.onlyIfNew ? SQL.init : SQL.update, options.onlyIfNew ? params : [...params, options.onlyIfMatch]);
    return { modified: rows.length === 1, ...(rows.length ? { etag: rows[0].etag } : {}) };
  }
}
