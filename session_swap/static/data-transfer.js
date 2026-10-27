const $ = id => document.getElementById(id);
const buttons = [...document.querySelectorAll('button')];
async function call(action, data) {
  const token = $('token').value;
  if (token.length < 32 || /[\r\n]/.test(token)) throw new Error('Enter this site’s SWAP_ADMIN_TOKEN, at least 32 characters.');
  const response = await fetch('/api/admin/migration/' + action, {
    method: data === undefined ? 'GET' : 'POST', cache: 'no-store', redirect: 'error',
    headers: { Authorization: 'Bearer ' + token, 'X-Swap-Request': '1', 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) {
    let result; try { result = await response.json(); } catch {}
    throw new Error(result?.error || 'The transfer request failed. Check the production deployment and migration settings.');
  }
  return action === 'export' ? response.blob() : response.json();
}
function showCounts(result) {
  $('counts').textContent = `Board: ${result.frozen ? 'Paused' : 'Open'}\nSessions: ${result.sessions}\nStudents: ${result.students}\nRequests: ${result.requests}\nAccepted swaps: ${result.accepted}`;
}
function run(action) {
  return async () => {
    buttons.forEach(b => b.disabled = true); $('message').textContent = 'Working…';
    try { await action(); } catch (error) { $('message').textContent = error.message; }
    finally { buttons.forEach(b => b.disabled = false); }
  };
}
$('status').onclick = run(async () => { showCounts(await call('status')); $('message').textContent = 'Record counts loaded.'; });
$('export').onclick = run(async () => {
  if (!confirm('Pause this board now? Students will be unable to change swaps until a board is opened again.')) { $('message').textContent = 'Board unchanged.'; return; }
  showCounts(await call('freeze', {}));
  const blob = await call('export');
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'sessionexchange-backup.json.gz'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $('message').textContent = 'Backup downloaded. This board remains paused. Restore the file on the new site.';
});
$('restore').onclick = run(async () => {
  const file = $('backup').files[0];
  if (!file || file.size > 3_000_000) throw new Error('Select a compressed .json.gz backup smaller than 3 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 16000) binary += String.fromCharCode(...bytes.subarray(i, i + 16000));
  const result = await call('restore', { backup_gzip_base64: btoa(binary) });
  showCounts(result); $('message').textContent = 'Backup restored. Compare counts with the old board, then open this board for students.';
});
$('activate').onclick = run(async () => {
  if (!confirm('Open this board for student activity? Keep the other board paused to avoid separate swap histories.')) { $('message').textContent = 'Board unchanged.'; return; }
  showCounts(await call('activate', {})); $('message').textContent = 'This board is open for students.';
});
