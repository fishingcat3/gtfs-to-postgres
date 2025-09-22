"use strict";

import dotenv from "dotenv";
dotenv.config({ quiet: true });
import type { PoolClient } from "pg";

import { GtfsDataset } from "./GTFS";
import { endpoints } from "./Endpoints";

export const DATABASE_URL: string = process.env.DATABASE_URL as string;
export const NSW_APIKEY: string = process.env.NSW_APIKEY as string;

if (!DATABASE_URL || !NSW_APIKEY) {
    throw new Error("DATABASE_URL and NSW_APIKEY are required");
}

type HttpHeaders = Record<string, string>;

const SydneyHeaders: HttpHeaders = {
    accept: "application/octet-stream",
    authorization: `apikey ${NSW_APIKEY}`,
};

(async () => {
    for (let { name, url, headers } of endpoints) {
        headers ??= SydneyHeaders;
        const Gtfs = new GtfsDataset(name, url, headers);
        console.log(`Created ${name} dataset`);

        const GtfsClient: PoolClient = await Gtfs.dbClient();
        const zipPath = await Gtfs.downloadGtfs(GtfsClient);

        if (zipPath) {
            console.log(`Downloaded GTFS zip for ${name}: ${zipPath}`);
            await Gtfs.loadTables(GtfsClient, zipPath);
            console.log(`GTFS tables loaded for ${name}`);
        } else console.log(`GTFS already up to date for ${name}`);

        GtfsClient.release();
    }
    process.exit(0);
})();
