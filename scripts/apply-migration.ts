/* eslint-disable no-console */
import { config } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

config({ path: ".env.local" });

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "Missing SUPABASE_DB_URL in .env.local.\n" +
      "Get it from Supabase → Project Settings → Database → Connection string (URI).\n" +
      "Use the connection pooler string and include your database password.",
  );
  process.exit(1);
}

async function main() {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0001_init.sql"), "utf8");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Applying migration 0001_init.sql …");
  await client.query(sql);
  console.log("✅ Migration applied.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
