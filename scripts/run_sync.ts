import { config } from 'dotenv';
config();
import { syncCodex } from '../lib/sync/codex';

async function run() {
  const res = await syncCodex();
  console.log("Restored:", res);
  process.exit(0);
}

run().catch(console.error);
