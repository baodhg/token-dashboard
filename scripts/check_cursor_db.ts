import Database from 'better-sqlite3';
const db = new Database('C:/Users/Admin/.gemini/tmp/token-dashboard/temp_state.vscdb');
const rows = db.prepare("SELECT key FROM ItemTable WHERE key LIKE '%cursor%' OR key LIKE '%composer%'").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
