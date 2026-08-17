// Deliberately no `server-only` here: the Better Auth CLI and drizzle-kit both
// load this module in plain Node, where `server-only` throws on import.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "POSTGRES_URL is not set. Start Postgres with `npm run db:up` and set POSTGRES_URL in .env.",
  );
}

// Next's dev server re-evaluates modules on every change; without this the pool
// count climbs until Postgres refuses new connections.
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });

export { schema };
