# Move SessionExchange to Vercel

Full instructions: **VERCEL_MIGRATION.md**.

1. Decide whether to retain existing Netlify users and swaps. If yes, use the
   separate Netlify export patch and download a paused-board backup BEFORE
   replacing the project files. Keep Netlify builds stopped afterwards.
2. Upload this Vercel ZIP's extracted contents to your existing GitHub repository
   root. Include api/, server/, scripts/, session_swap/, vercel.json, package.json,
   package-lock.json and .github/workflows/excel-upload.yml.
3. In Vercel, Add New → Project → import VGdot12/SessionExchange. Framework: Other;
   root: repository root; build: npm run build; output: public; Node: 22.x.
4. Add a Neon Postgres database through Vercel Storage/Marketplace and connect it
   to the project. It supplies DATABASE_URL; keep its value private.
5. Set Vercel Production variables SWAP_EXCEL_UPLOAD_ENABLED=1,
   SWAP_MIGRATION_ENABLED=1, SWAP_TIMEZONE=Asia/Kolkata, SWAP_FLOW_TOKEN (existing
   private password, at least 32 characters), and SWAP_ADMIN_TOKEN (a separate
   private administrator password, at least 32 characters). Redeploy.
6. Open your stable production URL with /api/health. It should return ok: true,
   runtime: vercel-functions, storage: neon-postgres.
7. Open /data-transfer.html on Vercel and enter SWAP_ADMIN_TOKEN. Restore the old
   backup if keeping data. Compare counts, then click Open this board for students.
   For a fresh start, open the empty board without restoring.
8. Set SWAP_MIGRATION_ENABLED=0 in Vercel and redeploy after transfer is complete.
9. In GitHub Settings → Secrets and variables → Actions: set repository SECRET
   SWAP_FLOW_TOKEN to the Vercel value; set repository VARIABLE SWAP_SITE_URL to
   the stable Vercel production URL (e.g. https://your-project.vercel.app).
10. Enable/run Actions → Update sessions from Excel. A green run imports the current
    catalogue/sessions.xlsx. Future replacements use the same workflow.
11. Share the new site address. Keep the old board paused; students sign in again.

You do not need Netlify tokens or a Microsoft application on the Vercel project.
Your workbook still needs valid Event Time ranges, e.g. 08:30 - 09:30. Duration
and Subject are ignored. See the full guide for backup safety, deployment protection,
hidden workflow folder upload, troubleshooting and rollback limits.
