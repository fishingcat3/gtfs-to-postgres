"use strict";

import { Pool, PoolClient } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { createWriteStream, promises as fs } from "fs";
import { pipeline as Pipeline } from "stream/promises";
import unzipper from "unzipper";
import path from "path";
import os from "os";
import crypto from "crypto";

import { DATABASE_URL } from "./index";
import { tables } from "./Tables";

/**
 * Converts a string into a slug
 * @param x The string to convert into a slug
 * @returns The input converted into a slug
 */
function slugify(x: string): string {
    return x
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * Creates a GTFS dataset Postgres schema
 * @param name The name of the dataset (used for the schema name)
 * @param feedUrl The GTFS feed URL
 * @param headers Headers required for fetching the GTFS zip
 */

export class GtfsDataset {
    public readonly name: string;
    private readonly feedUrl: string;
    private readonly headers: Record<string, string>;
    /**
     * The pool used by the GTFS dataset
     */
    public pool!: Pool;
    /**
     * The schema name for the GTFS dataset, gtfs_{slug name}
     */
    public gtfsSchema: string;
    private readonly key1: number = 0x47465453; // GTFS
    private key2: number;

    constructor(name: string, feedUrl: string, headers: Record<string, string> = {}) {
        this.name = name;
        this.feedUrl = feedUrl;
        this.headers = headers;
        this.key2 = crypto.createHash("sha1").update(this.name).digest().readInt32BE(0);
        this.gtfsSchema = `gtfs_${slugify(name)}`;
    }

    private async dbPool(): Promise<void> {
        if (this.pool) return;
        this.pool = new Pool({ connectionString: DATABASE_URL });
    }

    /**
     * Requests a client for the GTFS dataset Postgres DB
     * @returns A promise, with a Postgres {@link PoolClient}
     */
    public async dbClient(): Promise<PoolClient> {
        await this.dbPool();
        const client: PoolClient = await this.pool.connect();
        return client;
    }

    private async acquireLock(client: PoolClient): Promise<void> {
        const { rows } = await client.query("SELECT PG_TRY_ADVISORY_LOCK($1::INT, $2::INT) AS ok;", [
            this.key1,
            this.key2,
        ]);
        if (!rows[0]?.ok) throw new Error("Unable to obtain lock, another update is running");
    }

    private async releaseLock(client: PoolClient): Promise<void> {
        await client.query("SELECT PG_ADVISORY_UNLOCK($1::INT, $2::INT);", [this.key1, this.key2]);
    }

    /**
     * Attempt to download the GTFS from the URL
     * @param client A database client obtained using {@link dbClient}
     * @returns A promise, either with the path to the zip file or null if the feed zip was not downloaded
     */
    public async downloadGtfs(client: PoolClient): Promise<string | null> {
        await this.acquireLock(client);
        await client.query(
            `CREATE SCHEMA IF NOT EXISTS gtfsmeta;
            CREATE TABLE IF NOT EXISTS gtfsmeta.feed_meta(
                dataset TEXT PRIMARY KEY,
                etag TEXT,
                last_modified TEXT,
                fetched_at TIMESTAMPTZ
            );`,
        );
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `gtfs_${slugify(this.name)}_`));
        const zipPath = path.join(tmp, "feed.zip");
        try {
            const { rows } = await client.query("SELECT etag, last_modified FROM gtfsmeta.feed_meta WHERE dataset=$1", [
                this.name,
            ]);
            const etag = rows[0]?.etag ?? undefined;
            const lastModified = rows[0]?.last_modified ?? undefined;
            const headers = structuredClone(this.headers);
            if (etag) headers["If-None-Match"] = etag;
            if (lastModified) headers["If-Modified-Since"] = lastModified;
            const res = await fetch(this.feedUrl, { headers });
            const newEtag = res.headers.get("etag") || null;
            const newLastModified = res.headers.get("last-modified") || null;
            if (res.status === 304 || etag === newEtag || lastModified === newLastModified) {
                await this.releaseLock(client);
                await fs.rm(tmp, { recursive: true, force: true });
                return null;
            }
            if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}`);
            await Pipeline(res.body as any, createWriteStream(zipPath));
            await client.query(
                `INSERT INTO gtfsmeta.feed_meta(dataset, etag, last_modified, fetched_at) VALUES ($1, $2, $3, NOW())
                ON CONFLICT (dataset) DO UPDATE SET etag=EXCLUDED.etag, last_modified=EXCLUDED.last_modified, fetched_at=EXCLUDED.fetched_at`,
                [this.name, newEtag, newLastModified],
            );
            await this.releaseLock(client);
            return zipPath;
        } catch (e) {
            await this.releaseLock(client);
            throw e;
        }
    }

    /**
     * Unzip then load a GTFS zip into a Postgres DB
     * @param client A database client obtained using {@link dbClient}
     * @param zipPath A path to the GTFS zip, obtained from {@link downloadGtfs}. The zip will be deleted after, regardless of whether there was an error or not
     * @returns A void promise, once the tables have been loaded
     */
    public async loadTables(client: PoolClient, zipPath: string): Promise<void> {
        const tmpSchema = `${this.gtfsSchema}_tmp_${Date.now()}`;
        try {
            await client.query("BEGIN");
            await client.query(`CREATE SCHEMA ${tmpSchema}`);
            const dir = await unzipper.Open.file(zipPath);

            const fileHeaders = new Map<string, string[]>();
            for (const f of dir.files) {
                const table = tables.find((x) => x.file === f.path);
                if (!table) continue;

                const stream = f.stream();
                const header: string = await new Promise((resolve, reject) => {
                    let buffer = "";
                    const onData = (chunk: Buffer) => {
                        buffer += chunk.toString();
                        const newlineIndex = buffer.indexOf("\n");
                        if (newlineIndex !== -1) {
                            stream.removeListener("data", onData);
                            stream.destroy();
                            resolve(buffer.substring(0, newlineIndex).trim());
                        }
                    };
                    stream.on("data", onData);
                    stream.on("error", reject);
                    stream.on("end", () => resolve(buffer.trim()));
                });
                const tableColumns = new Map(table.columns);
                const columns = header
                    .split(",")
                    .map((name) => name.trim().replace(/"/g, ""))
                    .filter((name) => tableColumns.has(name));
                await client.query(
                    `CREATE TABLE ${tmpSchema}.${table.name} (${columns
                        .map((y) => `${y} ${tableColumns.get(y)}`)
                        .join(", ")});`,
                );
                fileHeaders.set(f.path, columns);
            }

            for (const f of dir.files) {
                const table = tables.find((x) => x.file === f.path);
                if (!table) continue;
                const columns = fileHeaders.get(f.path);
                if (!columns) continue;

                const stream = f.stream();
                const copyStream = client.query(
                    copyFrom(
                        `COPY ${tmpSchema}.${table.name} (${columns.join(
                            ",",
                        )}) FROM STDIN WITH (FORMAT CSV, HEADER, DELIMITER ',', NULL '', FORCE_NULL(${columns.join(
                            ",",
                        )}))`,
                    ),
                );
                await Pipeline(stream as any, copyStream as any);
            }
            await client.query("COMMIT");
            await client.query("BEGIN");
            await client.query(`DROP SCHEMA IF EXISTS ${this.gtfsSchema} CASCADE`);
            await client.query(`ALTER SCHEMA ${tmpSchema} RENAME TO ${this.gtfsSchema}`);
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            await fs.rm(path.dirname(zipPath), { recursive: true, force: true });
        }
    }
}
