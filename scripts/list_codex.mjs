import pg from 'pg';
import { config } from 'dotenv';
config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const res1 = await pool.query('SELECT count(*), sum("inputTokens" + "outputTokens") as total_tokens FROM calls WHERE "sessionId" = \'codex_019e721b-05f1-7931-a7f6-e89488094c0f\'');
  console.log("Session 1:", res1.rows);
  const res2 = await pool.query('SELECT count(*), sum("inputTokens" + "outputTokens") as total_tokens FROM calls WHERE "sessionId" = \'codex_019e721c-7612-7e83-8db8-aeee02e0bf18\'');
  console.log("Session 2:", res2.rows);
  
  // also check if there are any aggregate records
  const res3 = await pool.query('SELECT * FROM calls WHERE id LIKE \'codex_thread_%\'');
  console.log("Aggregate records:", res3.rowCount);

  // Check if there are any duplicate timestamps for the same session
  const res4 = await pool.query('SELECT "sessionId", count(*) as total, count(DISTINCT timestamp) as unique_ts FROM calls GROUP BY "sessionId" HAVING count(*) != count(DISTINCT timestamp)');
  console.log("Duplicate timestamps:", res4.rows);
  
  process.exit(0);
}

run().catch(console.error);
