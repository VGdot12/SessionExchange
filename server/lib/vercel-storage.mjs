import { Repository } from './repository.mjs';
import { emptyDocument, hash } from './model.mjs';
import { PostgresStore } from './postgres-store.mjs';

export function namespaceFor(env) {
  if (env.VERCEL_ENV === 'production') return 'sessionexchange-production-v1';
  const deployment = env.VERCEL_URL || env.VERCEL_GIT_COMMIT_SHA || 'local';
  return `sessionexchange-preview-${hash(deployment).slice(0,24)}-v1`;
}
export function siteRepository(env = process.env, fetcher = fetch) {
  const store = new PostgresStore({ connectionString: env.DATABASE_URL || env.POSTGRES_URL || '', namespace: namespaceFor(env), fetcher });
  return new Repository(store, () => {
    const d = emptyDocument();
    if (env.SWAP_MIGRATION_ENABLED === '1') d.migration = { frozen: true };
    return d;
  });
}
