# SessionExchange for Vercel

A student session swap board with name/PGID entry, requests for a specific other
event or any event, a public list of open requests, and private accepted history
for both participants. Students can swap across company events. Assignments remain
self-reported in this prototype.

Start with **START_HERE.md** and follow **VERCEL_MIGRATION.md** for the complete
migration, including optional transfer of existing Netlify records.

## Hosting and data

Vercel serves public assets built from session_swap/static and runs api/index.js.
The shared state is stored in Neon Postgres using parameterized SQL over HTTPS.
The table is created automatically. Each mutation checks the previous revision in
an atomic UPDATE, so concurrent acceptances cannot both succeed or lose another
student's update. This remains a prototype using an 8 MB application document.
Production state persists across deploys. Preview state uses a different namespace;
preview integrations and transfers cannot write to production.

No Node packages are required at runtime. Node 22 is configured. All database
credentials and administrator tokens stay server-side. The page and API use the
same domain. GET /api/health confirms database access and identifies the platform.

## Excel updates

Upload **catalogue/sessions.xlsx** on the default branch. GitHub Actions validates
the workbook, then updates the Vercel API. Set GitHub repository variable
**SWAP_SITE_URL** to the stable Vercel production origin and repository secret
**SWAP_FLOW_TOKEN** to the same private value as Vercel.

The reader supports Company Name / Event Type / Event Date / Event Time / Venue,
title / room / time / date, and the original nine-column schema. It detects
headings in the first 50 rows. Subject and Duration are ignored. Every completed
row is imported. Event Time must contain both times, such as 08:30 - 09:30.
Existing sessions omitted from Excel stay saved. Accepted snapshots and student
records remain. Room corrections preserve open requests. A schedule correction
on an existing stable ID closes related open posts for review; title/date/start
changes without stable IDs identify a new event. Conflicting or invalid workbooks
fail without partial updates.

The entire workbook is visible to everyone who can access its GitHub repository.
Use a private repository or a reduced session-only copy for confidential data.

## Transfer existing records

The separate Netlify export patch adds /data-transfer.html to the old site.
Pause/export there, restore on Vercel into an empty board, compare counts, and open
only the new board. The gzip backup retains session IDs, students, declared
assignments, open requests and accepted snapshots. Old login sessions are cleared;
students sign in again. The transfer endpoint needs SWAP_ADMIN_TOKEN, separate
from the ingest-only SWAP_FLOW_TOKEN, and only runs on production when enabled.
Disable the migration setting after completion. Keep backups out of GitHub.

## Validation

Run npm test, npm run build, and python -m unittest discover -s tests -v after
installing Python requirements. Platform tests use the real application handlers
and a simulated PostgreSQL HTTP service; live Vercel/Neon account provisioning
and deployment must be verified by the owner using the migration checklist.

PGID-only entry does not verify a student's identity. The app records a peer swap
agreement and does not change official institutional allocations.
