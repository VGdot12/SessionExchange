import { createHandler } from './handler.mjs';
import { siteRepository } from './vercel-storage.mjs';
import { Problem } from './model.mjs';

export function applicationRequest(request) {
  const url = new URL(request.url), route = url.searchParams.get('__swap_route');
  if (route !== null) {
    if (!/^[a-zA-Z0-9/-]+$/.test(route) || route.includes('..') || route.startsWith('/')) throw new Problem('Invalid API path.');
    url.pathname = '/api/' + route; url.searchParams.delete('__swap_route');
    return new Request(url, { method: request.method, headers: request.headers,
      ...(['GET','HEAD'].includes(request.method) ? {} : { body: request.body, duplex: 'half' }) });
  }
  return request;
}
export function makeVercelEntry({ env = process.env, fetcher = fetch, repository } = {}) {
  let saved = repository;
  return async request => {
    try {
      saved ||= siteRepository(env, fetcher);
      const production = env.VERCEL_ENV === 'production';
      const handler = createHandler(saved, {
        runtime: 'vercel-functions', storageName: 'neon-postgres', bodyLimit: 4_400_000,
        timezone: env.SWAP_TIMEZONE || 'Asia/Kolkata', adminToken: env.SWAP_ADMIN_TOKEN || '',
        excelUpload: { enabled: env.SWAP_EXCEL_UPLOAD_ENABLED === '1', token: env.SWAP_FLOW_TOKEN || '', production },
        migration: { enabled: env.SWAP_MIGRATION_ENABLED === '1', production, allowRestore: true },
        outlook: { enabled: false, configured: false, can_run: false },
      });
      return await handler(applicationRequest(request), { ip: request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown' });
    } catch (error) {
      return Response.json({ error: error instanceof Problem ? error.message : 'The swap service is unavailable. Check the database and function settings.' },
        { status: error instanceof Problem ? error.status : 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
  };
}
