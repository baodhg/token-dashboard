import pg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const r1 = await pool.query(`DELETE FROM sync_state WHERE "filePath" LIKE 'codex:%' RETURNING "filePath"`);
  console.log(`Deleted ${r1.rowCount} codex sync state entries`);

  const r2 = await pool.query(`DELETE FROM calls WHERE source='codex' AND id NOT LIKE 'codex_thread_%' RETURNING id`);
  console.log(`Deleted ${r2.rowCount} existing per-request codex records`);

  await pool.end();
}

main().catch(console.error);
