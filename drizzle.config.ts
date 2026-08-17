import type { Config } from "drizzle-kit";

if (!process.env.POSTGRES_URL) {
  // drizzle-kit loads .env itself; this only fires when the variable is truly absent.
  throw new Error(
    "POSTGRES_URL is not set. Copy it into .env — see .env.example.",
  );
}

export default {
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.POSTGRES_URL },
} satisfies Config;
