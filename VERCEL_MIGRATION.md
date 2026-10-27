# Migrate SessionExchange from Netlify to Vercel

This release moves the website and API to Vercel and persistent data to Neon
Postgres. Excel uploads continue through GitHub Actions. The current session-swap
features, PGID/name entry, public open requests and private accepted history remain.

You will use these downloads:

- **SessionExchange-Vercel.zip**: the new complete project.
- **Netlify-Data-Export-Patch.zip**: optional, only to keep existing Netlify records.
- **Vercel-Excel-Workflow.yml**: a visible copy of the workflow for manual creation
  if your computer will not upload the hidden .github folder.

Do not delete the old Netlify site or database during the transfer. Moving the
GitHub code by itself does not copy Netlify's saved student/swap records. If you
have no real users or swaps to retain, use the fresh-start path below.

## A. Keep existing Netlify students and swaps (skip for a fresh start)

### A1. Pause automated imports while you transfer

In GitHub, open **Actions → Update sessions from Excel → … → Disable workflow**.
Also disable the old **Deliver Outlook session invite** workflow if it exists.
Do not upload a new workbook until the new site is ready.

### A2. Add the export tool to Netlify before uploading the Vercel project

1. Extract **Netlify-Data-Export-Patch.zip**.
2. Upload its extracted folders/files to the existing repository root, replacing
   the matching files. This patch keeps your Netlify runtime and data store.
3. In Netlify's Production environment, set **SWAP_MIGRATION_ENABLED=1**.
4. Set **SWAP_ADMIN_TOKEN** to a separate random private password of at least
   32 characters. This is the administrator password, not SWAP_FLOW_TOKEN.
5. Keep SWAP_OUTLOOK_ENABLED=0 and SWAP_POWER_AUTOMATE_ENABLED=0.
6. Redeploy Netlify from GitHub and wait until Published.

### A3. Download a final backup

1. Open **https://sessionexchange.netlify.app/data-transfer.html**.
2. Enter the Netlify SWAP_ADMIN_TOKEN in the administrator password box.
3. Click **Show record counts** and note the numbers.
4. Click **Pause board and download backup**, then confirm the pause.
5. Save **sessionexchange-backup.json.gz** somewhere private. Keep the file intact.
6. The old board now rejects new sign-ins, posts, acceptances and Excel imports.
   This pause is stored with the records and survives redeploys.
7. In Netlify, stop automatic builds or disconnect its Git repository connection
   so later Vercel code changes do not try to rebuild the old site.

If the download fails after pausing, the board stays paused. Retry the export;
choose **Open this board for students** only if abandoning the move before the
new board starts receiving student activity.

The backup retains session IDs, students, self-reported allocations, open requests
and accepted snapshots. Old login sessions and rate-limit counters are cleared
on transfer, so students will sign in again at the new address.

Backups contain student data: do not upload them to GitHub or paste them in chat.
The browser transfer accepts compressed backups up to 3 MB and checks the
uncompressed document against the prototype's 8 MB storage limit. If your backup
exceeds the upload limit, retain it and do not retire the old board; a larger
transfer route will be needed before cutover.

## B. Upload the Vercel project

1. Extract **SessionExchange-Vercel.zip**.
2. Open **https://github.com/VGdot12/SessionExchange** on the default branch.
3. Upload the extracted contents into the repository root, replacing files.
   Keep **vercel.json**, **package.json**, **package-lock.json**, **api**, **server**,
   **scripts**, **session_swap** and **catalogue** at that level.
4. Commit. Do not upload the ZIP itself or add an extra parent folder.
5. Replace **.github/workflows/excel-upload.yml** with this release's version.
   Keep that exact workflow path so its version sequence remains consistent.

If uploading the hidden .github folder is difficult:

1. On GitHub, open the existing **.github/workflows/excel-upload.yml** file and
   click the pencil to edit, or use **Add file → Create new file**.
2. Enter the exact path **.github/workflows/excel-upload.yml** if creating it.
3. Open **Vercel-Excel-Workflow.yml** from the download, copy all its contents,
   paste into the GitHub editor and commit.

Old netlify files may remain in the repository after a web upload; Vercel ignores
that directory. The new API only imports server/lib. Keep the old site's builds
stopped after downloading its backup. Vercel does not use netlify.toml.

## C. Create the Vercel project

1. Sign in to Vercel and choose **Add New → Project**.
2. Connect/import **VGdot12/SessionExchange** from GitHub.
3. Use these build settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Other |
| Root Directory | repository root (leave the default, not SessionExchange) |
| Build Command | npm run build |
| Output Directory | public |
| Install Command | npm ci --ignore-scripts |
| Node.js Version | 22.x |

The supplied vercel.json sets routing, security headers and the build output.
It maps /api/* into the Vercel function. There is no separate Python web server.
Python is used only in GitHub Actions to read Excel.

## D. Connect a persistent database

The app needs a database so all students see the same board and records survive
new deployments. Vercel supports Neon through its storage marketplace:
[Vercel storage guidance](https://vercel.com/docs/marketplace-storage).

1. Open the Vercel project's **Storage** tab (or Marketplace storage integrations).
2. Choose **Create Database / Browse Marketplace**, then **Neon Postgres**.
3. Create a database, or connect an existing empty Neon database to this project.
4. Choose an available database region near your function region where practical.
5. Connect it to the project for **Production**. The integration supplies a private
   **DATABASE_URL** environment variable.
6. Confirm DATABASE_URL appears in Vercel's project environment settings. If your
   integration used another prefix, add DATABASE_URL with the connection string
   from Neon → Connect. It starts with postgresql:// and includes the password.

Use the normal read/write Neon connection, not a read replica. Both pooled and
direct Neon URLs work. The app uses Neon's HTTPS SQL interface and creates its
single table automatically; no SQL editor setup is required. It does not depend
on Netlify, Redis or a local database after the move. Review the provider's plan
and usage allowances before confirming a subscription; no paid plan is required
by the code itself.

## E. Add the Vercel environment variables

Open the Vercel project → **Settings → Environment Variables** and set these for
**Production**:

| Name | Value |
| --- | --- |
| DATABASE_URL | Supplied by Neon; keep private |
| SWAP_EXCEL_UPLOAD_ENABLED | 1 |
| SWAP_FLOW_TOKEN | Your existing private delivery password, at least 32 characters on one line |
| SWAP_ADMIN_TOKEN | A separate private administrator password, at least 32 characters |
| SWAP_TIMEZONE | Asia/Kolkata |
| SWAP_MIGRATION_ENABLED | 1 during setup and transfer |

You may reuse the Netlify SWAP_FLOW_TOKEN and SWAP_ADMIN_TOKEN values to make the
transition easier. Keep the two token purposes separate. Vercel does not copy
Netlify environment variables automatically. No Netlify token, Microsoft app
credentials or Outlook connection is needed.

Keep the Vercel setting to automatically expose system environment variables
enabled: the code uses VERCEL_ENV to distinguish production from previews. The
code isolates preview state even when a preview can reach the same database.
Connect a separate Neon branch if you want dedicated preview testing.

Deploy or redeploy after connecting Neon and saving the variables. Changes apply
to new deployments:
[Vercel environment variable guidance](https://vercel.com/docs/environment-variables/managing-environment-variables).

A brand-new board with migration enabled starts paused automatically. This prevents
new student records from arriving before you restore the old data.

## F. Verify storage, then restore or open the new board

1. Open your stable Vercel **Production** URL. Use the project domain, such as
   https://your-project.vercel.app, not an individual preview deployment URL.
2. Add **/api/health**. A successful response includes:

   {"ok":true,"runtime":"vercel-functions","storage":"neon-postgres"}

3. Open **/data-transfer.html** on that same Vercel site.
4. Enter the Vercel SWAP_ADMIN_TOKEN and click **Show record counts**.
5. If preserving Netlify data, choose the downloaded .json.gz backup and click
   **Restore backup**. Restore refuses to overwrite a nonempty board. Repeating
   the same successful restore is safe and does not duplicate records.
6. Compare the session, student, request and accepted-swap counts with Netlify.
7. Click **Open this board for students** when ready.
8. If starting fresh, skip restore and open the empty board. You can then import Excel.
9. Set **SWAP_MIGRATION_ENABLED=0** in Vercel and redeploy to disable the transfer
   endpoints after the move. The database remains open; disabling the endpoint
   does not erase data or automatically open a board that is still paused.

Do not create test student accounts on the destination before a restore; that
makes it nonempty. After activating it, you can validate your own existing PGID
and request history. Students need to sign in again at the new hostname.

## G. Point GitHub Excel updates to Vercel

The previous workflow had the Netlify address built into its script. This release
uses a repository variable so you can choose the new Vercel address without editing
code.

1. Open GitHub → repository → **Settings → Secrets and variables → Actions**.
2. Under **Secrets → Repository secrets**, create/update **SWAP_FLOW_TOKEN** with
   exactly the same private VALUE as Vercel. No quotes, Bearer prefix or line breaks.
3. Switch to **Variables → Repository variables → New repository variable**.
4. Name: **SWAP_SITE_URL**.
5. Value: your stable Vercel Production origin, e.g. **https://your-project.vercel.app**.
   Use only the origin, not /api or a page path. A trailing slash is accepted.
6. Save. You do not need to put DATABASE_URL or SWAP_ADMIN_TOKEN in GitHub Actions.
7. Re-enable **Actions → Update sessions from Excel** if you disabled it.
8. Choose **Run workflow** on the default branch. If catalogue/sessions.xlsx exists,
   it imports the current workbook. With no workbook it performs a connection check.
9. Look for a green run. The **Update Vercel sessions** step reports counts.
10. Refresh the app and check the assigned-session selector. Future uploads use
    the same **catalogue/sessions.xlsx** path and trigger updates automatically.

If Vercel's deployment protection blocks the workflow, use a stable public production
URL. If your production deployment must remain protected, create an automation
bypass secret in Vercel → Settings → Deployment Protection → Protection Bypass
for Automation, then save it as the GitHub repository secret
**VERCEL_AUTOMATION_BYPASS_SECRET**. The supplied workflow sends the supported
bypass header. See
[Vercel's automation bypass documentation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
This bypass does not replace the app's SWAP_FLOW_TOKEN check.

## H. Workbook format remains the same

- Headers can start in row 3, with leading blank rows/columns. The reader searches
  the first 50 rows. Prefer a single matching sheet or name it Sessions.
- Company Name + Event Type produce the title; Venue supplies the room; Event Date
  supplies the date; Event Time supplies both start and end.
- **Event Time must be a range**, e.g. **08:30 - 09:30**, using same-day 24-hour times.
  A single Excel clock time will fail validation. Correct these cells before uploading.
- Duration may say 1hr, but it is ignored. Subject is ignored. Every completed row
  is imported; invalid rows stop the whole import rather than partially updating.
- Company Name, Event Type, Event Date, Event Time and Venue headings are supported,
  as are title/room/time/date and the original nine-column schema.
- Dates may be Excel dates, YYYY-MM-DD, DD/MM/YYYY or 27 October, 2026.
- Formula cells in imported fields are rejected. Subject/Duration/other unused
  metadata are not sent to Vercel.
- The Excel file is not copied into public website assets. A public GitHub repo
  still exposes the source workbook, including unused columns; use a private repo
  or a reduced session-only workbook for private data.
- Omitted events are retained. Room corrections preserve open requests. For a
  deliberate reschedule retain an existing session_id; changing title/date/start
  without a stable ID creates a new event and retains the old one. Existing-ID
  schedule changes close affected open requests. Accepted snapshots remain intact.

Vercel Functions have a request payload limit. This delivery script caps the
prepared catalogue below that limit; very large workbooks may need fewer rows
per upload. The reader limits remain 10 MB compressed workbook, 30 MB uncompressed,
20,000 data rows and 50 columns. No manual Netlify/Vercel redeploy is needed for
each successful data-only Excel delivery.

## I. Finish the cutover

Share the new production address. Leave Netlify paused and keep the private
backup until you have verified the new board. The old and new databases are
separate; do not open both for student activity. You can retire the old site
later after confirming the new deployment and history.

Rollback before new student activity: pause the Vercel board (temporarily re-enable
migration endpoints and redeploy if needed), then reopen Netlify with its transfer
tool. After students have changed records on Vercel, reopening the old backup
would omit those changes. Keep Vercel authoritative and plan a reverse transfer
before any later rollback; do not simply reopen both boards.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Website 404 | Framework Other, root repository folder, output public; vercel.json and api/index.js must be committed. |
| /api/health returns 503 | Connect Neon, check Production DATABASE_URL and redeploy. Do not paste the connection string into logs or chat. |
| Health returns HTML/login | Check the stable production URL and Vercel deployment protection. |
| Board says paused | Open /data-transfer.html with the administrator password and activate it after restoring/checking data. |
| Transfer endpoint 503 | Enable SWAP_MIGRATION_ENABLED=1 and redeploy; production site required. |
| Restore says nonempty | Do not overwrite it. Retain the backup and inspect whether test accounts or real activity were created there. |
| Excel delivery token missing | Add SWAP_FLOW_TOKEN as a GitHub repository SECRET, matching Vercel, at least 32 characters on one line. |
| SWAP_SITE_URL missing/invalid | Add it as a GitHub repository VARIABLE containing the stable HTTPS Vercel origin. |
| Excel endpoint 403 | Token mismatch, preview URL or deployment protection. Check Production, the shared token and optional automation bypass. |
| Excel endpoint 503 | Enable SWAP_EXCEL_UPLOAD_ENABLED=1, activate the new board, check database access and redeploy if settings changed. |
| Workbook validation failure | Read the row/column error. Keep full Event Time ranges and the required headings. No session rows were delivered. |
| Imports show older:true | A newer workflow version already imported data; use Run workflow to run the current default-branch workbook. |

The provided tests cover concurrent acceptances, cold handlers using the same
simulated PostgreSQL HTTP service, revision checks, login/cookies, private history,
preview isolation, safe restore, and Excel delivery. The static build and function
bundle are checked locally. No live Vercel project or Neon account has been
provisioned or deployed by this chat; complete the health/transfer checklist to
verify your connected production environment.
