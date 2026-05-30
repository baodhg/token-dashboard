import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

const dbPath = join(homedir(), ".codex", "state_5.sqlite");
const db = new Database(dbPath, { readonly: true });
const threads = db.prepare("SELECT id, cwd, tokens_used, created_at_ms, rollout_path FROM threads").all();
console.table(threads);
db.close();
