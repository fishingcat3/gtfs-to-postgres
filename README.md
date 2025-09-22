# gtfs-to-postgres

Made with **Nodejs** and **TypeScript**\
For storing TfNSW GTFS bundles in a PostgreSQL database

Modify columns and tables to download in: `/src/tables.ts`\
Modify GTFS endpoints in: `/src/Endpoints.ts`

Utilises `CITEXT` extension for easy querying: `CREATE EXTENSION citext;`

Recommended **cron schedule**: `0 */4 * * *`\
Build command: `pnpm build`\
Update command: `pnpm start`

**.env**\
`DATABASE_URL` = Postgres Database URL\
`NSW_APIKEY` = TfNSW API Key
