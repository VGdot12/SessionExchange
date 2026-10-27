import { mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'public'), { recursive: true });
for (const file of ['index.html','app.js','style.css','favicon.svg','data-transfer.html','data-transfer.js','data-transfer.css']) {
  await copyFile(path.join(root,'session_swap/static',file),path.join(root,'public',file));
}
await access(path.join(root,'api/index.js'));
console.log('Built the student interface and private data transfer tool. Vercel will package the API.');
