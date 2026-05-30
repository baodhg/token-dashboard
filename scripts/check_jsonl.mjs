import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";

// we use a node version that has better-sqlite3 installed that works with it
// let's just write a script that doesn't use better-sqlite3, but reads the jsonl directly!
// we can just read the first few lines of the jsonl files to see what they contain
import { readFileSync, readdirSync } from "fs";

const dir = join(homedir(), ".codex", "sessions", "2026", "05", "29");
const files = readdirSync(dir).filter(f => f.endsWith(".jsonl"));

for (const file of files) {
  const content = readFileSync(join(dir, file), "utf-8");
  const lines = content.split("\n").filter(l => l.includes('"token_count"'));
  console.log("File:", file);
  console.log("Total token_count events:", lines.length);
  // print the first 2 token counts
  console.log(lines.slice(0, 2).map(l => JSON.parse(l).payload.info.last_token_usage));
}
