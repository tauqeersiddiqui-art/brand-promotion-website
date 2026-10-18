/* Deletes the SQLite database file and re-seeds. Run: npm run db:reset */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
for (const f of ["app.db", "app.db-journal", "app.db-wal", "app.db-shm"]) {
  const p = path.join(DATA_DIR, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
console.log("Database removed.");

require("./seed.js");
