import pg from 'pg';
import { config } from 'dotenv';
config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const res1 = await pool.query("DELETE FROM calls WHERE source = 'codex'");
  console.log("Deleted", res1.rowCount, "calls");
  
  const res2 = await pool.query("DELETE FROM sync_state WHERE \"filePath\" LIKE 'codex:%'");
  console.log("Deleted", res2.rowCount, "sync_state");
  
  console.log("Done");
  process.exit(0);
}

run().catch(console.error);
