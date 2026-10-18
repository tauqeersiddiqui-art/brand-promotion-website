/* Set (or reset) a user's password directly in the database.
   Usage: node scripts/set-password.js <email> <new-password> */
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const [, , email, newPassword] = process.argv;
if (!email || !newPassword) {
  console.error("Usage: node scripts/set-password.js <email> <new-password>");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const db = new Database(path.join(process.cwd(), "data", "app.db"));
db.pragma("journal_mode = WAL");
const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email.toLowerCase());
if (!user) {
  console.error(`No account found for ${email}`);
  process.exit(1);
}
db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 12), user.id);
console.log(`Password updated for ${user.email}`);
db.close();
