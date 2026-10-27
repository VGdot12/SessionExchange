import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function catalogueEndpoint(siteURL) {
  let url;
  try { url = new URL(siteURL); } catch { throw new DeliveryError('Add the GitHub Actions repository variable SWAP_SITE_URL with your Vercel production URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.endsWith('.netlify.app') || url.hostname === 'localhost') throw new DeliveryError('SWAP_SITE_URL must be your HTTPS Vercel production site origin, with no extra path or login details.');
  return new URL('/api/integrations/catalogue', url).href;
}
export class DeliveryError extends Error {}

export async function deliverCatalogue({ payload, token, siteURL, bypassSecret = '', check = false, fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (typeof token !== 'string' || token.length < 32 || /[\r\n]/.test(token)) throw new DeliveryError('Add the GitHub Actions secret SWAP_FLOW_TOKEN with the same value as Vercel.');
  const endpoint = catalogueEndpoint(siteURL);
  if (typeof bypassSecret !== 'string' || /[\r\n]/.test(bypassSecret)) throw new DeliveryError('Invalid Vercel protection bypass setting.');
  if (!check && (!payload || !Array.isArray(payload.sessions) || !payload.sessions.length || !Number.isSafeInteger(payload.version) || payload.version < 1 || !/^[a-f0-9]{40}$/.test(payload.commit || ''))) throw new DeliveryError('The prepared workbook payload or workflow version is invalid.');
  const body = check ? null : JSON.stringify(payload);
  if (body && Buffer.byteLength(body) > 4_300_000) throw new DeliveryError('The prepared catalogue is too large. Reduce the number of rows.');
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetcher(endpoint, { method: check ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Swap-Request': '1', ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}) },
        ...(check ? {} : { body }) });
    } catch {
      if (attempt < 3) { await pause(3000 * (attempt + 1)); continue; }
      throw new DeliveryError('Vercel could not be reached. Re-run this workflow after confirming the production deployment is published.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([404, 429, 500, 502, 503, 504].includes(response.status) && attempt < 3) { await pause(3000 * (attempt + 1)); continue; }
      const help = response.status === 403 ? 'Check the matching SWAP_FLOW_TOKEN values and use the production site.' :
        response.status === 404 || response.status === 503 ? 'Deploy the new code with SWAP_EXCEL_UPLOAD_ENABLED=1, then re-run this workflow.' :
        response.status === 400 || response.status === 409 ? 'Review conflicting rows, inactive events and stable session IDs. No rows from this import were saved.' : 'Check the Vercel function logs.';
      throw new DeliveryError(`Vercel returned HTTP ${response.status}. ${help}`);
    }
    const chunks = []; let length = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new DeliveryError('Vercel returned an empty response.');
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 100000) { await reader.cancel(); throw new DeliveryError('Unexpected Vercel response size.'); }
      chunks.push(Buffer.from(value));
    }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new DeliveryError('Vercel did not return JSON. Deploy the updated API first.'); }
    if (result?.ok !== true || (check && result.ready !== true)) throw new DeliveryError('Vercel did not confirm the import.');
    const safe = { ok: true };
    for (const key of ['ready', 'duplicate', 'older']) if (result[key] === true) safe[key] = true;
    for (const key of ['added', 'updated', 'unchanged', 'cancelled']) {
      if (Number.isSafeInteger(result[key]) && result[key] >= 0) safe[key] = result[key];
    }
    return safe;
  }
}

async function main() {
  try {
    const check = process.argv.includes('--check');
    let payload;
    if (!check) {
      const file = process.env.CATALOGUE_JSON;
      if (!file || (await stat(file)).size > 4_200_000) throw new DeliveryError('The prepared catalogue is missing or too large.');
      payload = JSON.parse(await readFile(file, 'utf8'));
      payload.version = Number(process.env.CATALOGUE_VERSION);
      payload.commit = process.env.CATALOGUE_COMMIT;
    }
    const result = await deliverCatalogue({ payload, token: process.env.SWAP_FLOW_TOKEN, siteURL: process.env.SWAP_SITE_URL, bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '', check });
    console.log(check ? 'Connection check passed. Upload catalogue/sessions.xlsx to import sessions.' : 'Workbook delivery complete.');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof DeliveryError ? error.message : 'Catalogue delivery failed. Check the workbook and workflow configuration.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
