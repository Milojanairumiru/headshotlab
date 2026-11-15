// Lists (and with --apply, deletes) the demo accounts seeded by earlier builds.
// Dry run by default; nothing is deleted unless you pass --apply.
//
//   node scripts/purge-demo-data.js
//   node scripts/purge-demo-data.js --apply
//   HL_DB_PATH=D:\path\to\headshotlab.db node scripts/purge-demo-data.js --apply
//
// Orders, photos, roster rows and sessions for these users are removed by the
// ON DELETE CASCADE constraints. Contact inquiries are never deleted.

const fs = require('fs');
const path = require('path');

const explicitPath = process.env.HL_DB_PATH;
const dbPath = explicitPath
  ? path.resolve(explicitPath)
  : path.join(__dirname, '..', 'data', 'headshotlab.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found: ' + dbPath);
  process.exit(1);
}

process.env.HL_DB_PATH = dbPath;
const DB = require('../db');

const DEMO_EMAILS = [
  'admin@headshotlab.com',   // old hardcoded admin (passcode login replaces it)
  'david@acme.io',           // sample individual client
  'marcus@nexusai.com'       // sample team client
];

const apply = process.argv.includes('--apply');
const rows = DEMO_EMAILS
  .map(email => DB.getUserByEmail(email))
  .filter(Boolean);

console.log('Database: ' + dbPath);
console.log('Mode: ' + (apply ? 'APPLY (delete)' : 'DRY RUN (no changes)'));

if (rows.length === 0) {
  console.log('No demo accounts found.');
  process.exit(0);
}

for (const user of rows) {
  const orders = DB.raw.prepare('SELECT id FROM orders WHERE user_id = ?').all(user.id);
  const roster = orders.length
    ? DB.raw.prepare(
        'SELECT COUNT(*) c FROM roster_members WHERE order_id IN (' +
        orders.map(() => '?').join(',') + ')'
      ).get(...orders.map(o => o.id)).c
    : 0;
  console.log(
    `- user #${user.id} ${user.email} (${user.role}/${user.type}); ` +
    `${orders.length} order(s): ${orders.map(o => o.id).join(', ') || 'none'}; ` +
    `${roster} roster row(s)`
  );
}

if (!apply) {
  console.log('\nThis was a dry run. Re-run with --apply to delete the rows above.');
  process.exit(0);
}

const deleteUser = DB.raw.prepare('DELETE FROM users WHERE id = ?');
let deleted = 0;
for (const user of rows) {
  deleteUser.run(user.id);
  deleted++;
}
console.log(`\nDeleted ${deleted} demo account(s) and their related rows.`);
