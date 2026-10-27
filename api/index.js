import { makeVercelEntry } from '../server/lib/vercel-entry.mjs';
const serve = makeVercelEntry();
export default { fetch: serve };
