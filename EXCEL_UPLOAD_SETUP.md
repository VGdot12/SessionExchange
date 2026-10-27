# Excel updates on Vercel

See VERCEL_MIGRATION.md, sections G and H, for the current workflow and workbook format.

Upload catalogue/sessions.xlsx on the default branch. Set GitHub repository variable SWAP_SITE_URL to your stable Vercel origin and repository secret SWAP_FLOW_TOKEN to the Vercel value. The receiver is /api/integrations/catalogue.

Every completed row is imported; Subject and Duration are ignored. Event Time must include both times, such as 08:30 - 09:30. Headings can be below blank rows.
