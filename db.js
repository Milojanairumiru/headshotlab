const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Allow tests to point at a throwaway database (never touch the live file).
const DB_PATH = process.env.HL_DB_PATH
  ? path.resolve(process.env.HL_DB_PATH)
  : path.join(DATA_DIR, 'headshotlab.db');

if (DB_PATH !== path.join(DATA_DIR, 'headshotlab.db')) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// ---------------------------------------------------------------------------
// Password hashing: scrypt with a random per-user salt.
// Format: scrypt$N$r$p$saltBase64$hashBase64
// Legacy rows created before 11 Nov 2026 hold an unsalted SHA-256 hex digest
// and are accepted once, then upgraded on the next successful sign-in.
// ---------------------------------------------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password is required');
  }
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem
  });
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    derived.toString('base64')
  ].join('$');
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Returns { ok, needsRehash }
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { ok: false, needsRehash: false };
  }

  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return { ok: false, needsRehash: false };
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    if (!N || !r || !p) return { ok: false, needsRehash: false };
    let salt;
    let expected;
    try {
      salt = Buffer.from(parts[4], 'base64');
      expected = Buffer.from(parts[5], 'base64');
    } catch (err) {
      return { ok: false, needsRehash: false };
    }
    let derived;
    try {
      derived = crypto.scryptSync(password, salt, expected.length, {
        N, r, p, maxmem: SCRYPT.maxmem
      });
    } catch (err) {
      return { ok: false, needsRehash: false };
    }
    const ok = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    return { ok, needsRehash: false };
  }

  // Legacy unsalted SHA-256.
  if (/^[0-9a-f]{64}$/i.test(storedHash)) {
    const legacy = crypto.createHash('sha256').update(password).digest('hex');
    if (timingSafeEqualStrings(legacy, storedHash.toLowerCase())) {
      return { ok: true, needsRehash: true };
    }
    return { ok: false, needsRehash: false };
  }

  return { ok: false, needsRehash: false };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
function initSchema() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'client', -- 'client', 'team_lead', 'admin'
      type TEXT DEFAULT 'individual', -- 'individual', 'team'
      company_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      package TEXT NOT NULL,
      order_date TEXT NOT NULL,
      eta TEXT DEFAULT 'In ~48 hours',
      status_text TEXT DEFAULT 'In Production (AI & Master Retouching)',
      status_class TEXT DEFAULT 'in-progress',
      current_step INTEGER DEFAULT 3,
      total_members INTEGER DEFAULT 1,
      completed_count INTEGER DEFAULT 0,
      in_progress_count INTEGER DEFAULT 1,
      waiting_count INTEGER DEFAULT 0,
      invite_url TEXT DEFAULT '',
      backdrop TEXT DEFAULT 'Editorial Studio Gray',
      wardrobe TEXT DEFAULT 'Tailored Suit',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      desc TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      active INTEGER DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      title TEXT NOT NULL,
      tag TEXT NOT NULL,
      url TEXT NOT NULL,
      ready INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roster_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT DEFAULT 'In Lab',
      status_class TEXT DEFAULT 'in-lab',
      photo_url TEXT DEFAULT 'hero_person_nobg.png',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      package_interest TEXT DEFAULT '',
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new', -- 'new', 'replied'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Server-side sessions. Only the SHA-256 of the session token is stored.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL,        -- 'client' | 'admin'
      user_id INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);
    CREATE INDEX IF NOT EXISTS idx_roster_order ON roster_members (order_id);
  `);
}

// NOTE: demo data seeding was removed on 11 Nov 2026. The previous seed created
// fake clients (David Vance / Marcus Vance) and a fabricated team roster.
initSchema();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Database Query Helpers
const DB = {
  raw: db,
  path: DB_PATH,
  hashPassword,
  verifyPassword,

  // User methods
  getUserByEmail(email) {
    const query = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
    return query.get(String(email || ''));
  },

  getUserById(id) {
    const query = db.prepare('SELECT id, name, email, role, type, company_name, created_at FROM users WHERE id = ?');
    return query.get(id);
  },

  getAllUsers() {
    const query = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.type, u.company_name, u.created_at,
             COUNT(o.id) as order_count
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return query.all();
  },

  createUser({ name, email, password, role = 'client', type = 'individual', companyName = '' }) {
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, type, company_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, hashPassword(password), role, type, companyName);
    return this.getUserById(result.lastInsertRowid);
  },

  setPasswordHash(userId, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  },

  // Verifies a password against the stored hash and upgrades legacy hashes.
  authenticate(email, password) {
    const user = this.getUserByEmail(email);
    if (!user) return null;

    const result = verifyPassword(password, user.password_hash);
    if (!result.ok) return null;

    if (result.needsRehash) {
      try {
        this.setPasswordHash(user.id, hashPassword(password));
      } catch (err) {
        // Login still succeeds; the hash upgrades on the next attempt.
      }
    }

    return this.getUserById(user.id);
  },

  // Kept for backwards compatibility, now KDF-based.
  verifyCredentials(email, password) {
    return this.authenticate(email, password);
  },

  // Order methods
  orderExists(orderId) {
    return Boolean(db.prepare('SELECT 1 AS found FROM orders WHERE id = ?').get(orderId));
  },

  getOrderByUserId(userId) {
    const orderQuery = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1');
    const order = orderQuery.get(userId);
    if (!order) return null;

    // The client portal reads camelCase fields; expose them alongside the raw
    // snake_case columns so both admin (snake_case) and portal keep working.
    order.totalMembers = order.total_members;
    order.completedCount = order.completed_count;
    order.inProgressCount = order.in_progress_count;
    order.waitingCount = order.waiting_count;
    order.currentStep = order.current_step;
    order.statusText = order.status_text;
    order.statusClass = order.status_class;
    order.orderDate = order.order_date;
    order.inviteUrl = order.invite_url;

    const stepsQuery = db.prepare('SELECT * FROM order_steps WHERE order_id = ? ORDER BY step_index ASC');
    order.steps = stepsQuery.all(order.id).map(s => ({
      title: s.title,
      desc: s.desc,
      completed: Boolean(s.completed),
      active: Boolean(s.active)
    }));

    const photosQuery = db.prepare('SELECT * FROM order_photos WHERE order_id = ? ORDER BY id DESC');
    order.photos = photosQuery.all(order.id).map(p => ({
      id: p.id,
      title: p.title,
      tag: p.tag,
      url: p.url,
      ready: Boolean(p.ready)
    }));

    const rosterQuery = db.prepare('SELECT * FROM roster_members WHERE order_id = ? ORDER BY id DESC');
    order.roster = rosterQuery.all(order.id).map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      email: r.email,
      status: r.status,
      statusClass: r.status_class,
      photoUrl: r.photo_url
    }));

    return order;
  },

  getOrderById(orderId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    return order || null;
  },

  getAllOrders() {
    const query = db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email, u.company_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);
    const orders = query.all();
    const photosQuery = db.prepare('SELECT * FROM order_photos WHERE order_id = ?');
    const rosterQuery = db.prepare('SELECT * FROM roster_members WHERE order_id = ?');
    orders.forEach(order => {
      order.photos = photosQuery.all();
      order.roster = rosterQuery.all();
    });
    return orders;
  },

  createOrder({
    id,
    userId,
    package: pkg,
    orderDate,
    eta = 'In ~48 hours',
    statusText = 'In Production (AI & Master Retouching)',
    statusClass = 'in-progress',
    currentStep = 3,
    totalMembers = 1,
    completedCount = 0,
    inProgressCount = 1,
    waitingCount = 0,
    inviteUrl = '',
    backdrop = 'Editorial Studio Gray',
    wardrobe = 'Tailored Suit',
    notes = '',
    photos = [],
    roster = []
  }) {
    const stmt = db.prepare(`
      INSERT INTO orders (
        id, user_id, package, order_date, eta, status_text, status_class,
        current_step, total_members, completed_count, in_progress_count,
        waiting_count, invite_url, backdrop, wardrobe, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, userId, pkg, orderDate, eta, statusText, statusClass,
      currentStep, totalMembers, completedCount, inProgressCount,
      waitingCount, inviteUrl, backdrop, wardrobe, notes
    );

    // Default steps
    const stepStmt = db.prepare(`
      INSERT INTO order_steps (order_id, step_index, title, desc, completed, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stepStmt.run(id, 1, 'Photos Received', 'Raw selfie uploaded & backed up securely.', 1, 0);
    stepStmt.run(id, 2, 'Quality & Lighting Check', 'Approved for production by senior retoucher.', 1, 0);
    stepStmt.run(id, 3, 'AI Synthesis & Retouching', 'Preserving skin natural texture, studio color grading & tailoring.', 0, 1);
    stepStmt.run(id, 4, 'Editorial Gallery Delivery', 'High-res 4K files ready for LinkedIn & print download.', 0, 0);

    // Photos
    const photoStmt = db.prepare(`
      INSERT INTO order_photos (order_id, title, tag, url, ready)
      VALUES (?, ?, ?, ?, ?)
    `);
    // No placeholder photos: an order only shows what the client supplied.
    if (photos && photos.length) {
      photos.forEach(p => {
        photoStmt.run(id, p.title || 'Uploaded Photo', p.tag || 'Upload Verified', p.url, p.ready ? 1 : 0);
      });
    }

    // Roster (only the members actually supplied by the client)
    if (roster && roster.length) {
      const rosterStmt = db.prepare(`
        INSERT INTO roster_members (order_id, name, role, email, status, status_class, photo_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      roster.forEach(r => {
        rosterStmt.run(id, r.name, r.role || 'Member', r.email, r.status || 'In Lab', r.statusClass || 'in-lab', r.photoUrl || 'hero_person_nobg.png');
      });
    }

    return this.getOrderByUserId(userId);
  },

  updateOrderStatus(orderId, { statusText, statusClass, currentStep, completedCount, inProgressCount, waitingCount, eta }) {
    const fields = [];
    const values = [];

    if (statusText !== undefined) { fields.push('status_text = ?'); values.push(statusText); }
    if (statusClass !== undefined) { fields.push('status_class = ?'); values.push(statusClass); }
    if (currentStep !== undefined) { fields.push('current_step = ?'); values.push(currentStep); }
    if (completedCount !== undefined) { fields.push('completed_count = ?'); values.push(completedCount); }
    if (inProgressCount !== undefined) { fields.push('in_progress_count = ?'); values.push(inProgressCount); }
    if (waitingCount !== undefined) { fields.push('waiting_count = ?'); values.push(waitingCount); }
    if (eta !== undefined) { fields.push('eta = ?'); values.push(eta); }

    if (fields.length > 0) {
      values.push(orderId);
      db.prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    // Update steps based on currentStep
    if (currentStep !== undefined) {
      const steps = db.prepare('SELECT id, step_index FROM order_steps WHERE order_id = ?').all(orderId);
      steps.forEach(s => {
        const completed = s.step_index < currentStep ? 1 : (s.step_index === currentStep && currentStep === 4 ? 1 : 0);
        const active = s.step_index === currentStep && currentStep !== 4 ? 1 : 0;
        db.prepare('UPDATE order_steps SET completed = ?, active = ? WHERE id = ?').run(completed, active, s.id);
      });
    }

    return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  },

  addPhotoToOrder(orderId, { title, tag, url, ready = 0 }) {
    const stmt = db.prepare(`
      INSERT INTO order_photos (order_id, title, tag, url, ready)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(orderId, title, tag, url, ready ? 1 : 0);
    return res.lastInsertRowid;
  },

  addRosterMember(orderId, { name, role, email, status = 'In Lab', statusClass = 'in-lab', photoUrl = 'hero_person_nobg.png' }) {
    const stmt = db.prepare(`
      INSERT INTO roster_members (order_id, name, role, email, status, status_class, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(orderId, name, role, email, status, statusClass, photoUrl);

    // Keep counts truthful: a new member is one more person in the roster.
    db.prepare(`
      UPDATE orders
      SET total_members = total_members + 1,
          in_progress_count = in_progress_count + 1
      WHERE id = ?
    `).run(orderId);

    return res.lastInsertRowid;
  },

  // Contacts
  createContact({ name, email, packageInterest = '', message }) {
    const stmt = db.prepare(`
      INSERT INTO contacts (name, email, package_interest, message)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, email, packageInterest, message);
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  },

  getAllContacts() {
    const query = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC');
    return query.all();
  },

  updateContactStatus(id, status) {
    db.prepare('UPDATE contacts SET status = ? WHERE id = ?').run(status, id);
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  },

  // Sessions
  createSession(kind, userId, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.deleteExpiredSessions();
    db.prepare(`
      INSERT INTO sessions (token_hash, kind, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(hashToken(token), kind, userId || null, now, now + ttlMs);
    return token;
  },

  getSession(token) {
    if (!token) return null;
    const row = db.prepare(`
      SELECT s.*, u.role AS user_role, u.email AS user_email
      FROM sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(hashToken(token));
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      this.deleteSession(row.token_hash);
      return null;
    }
    return row;
  },

  deleteSessionByToken(token) {
    if (!token) return;
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  },

  deleteSession(tokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  },

  deleteSessionsForUser(userId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  deleteExpiredSessions() {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  },

  // Stats for Admin
  getStats() {
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role != 'admin'").get().count;
    const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get().count;
    const activeOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status_class = 'in-progress'").get().count;
    const completedOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status_class = 'ready'").get().count;
    const totalContacts = db.prepare("SELECT COUNT(*) as count FROM contacts").get().count;
    const newContacts = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'new'").get().count;

    return {
      totalUsers,
      totalOrders,
      activeOrders,
      completedOrders,
      totalContacts,
      newContacts
    };
  },

  // Full Database Export (never includes password hashes)
  exportAll() {
    return {
      users: this.getAllUsers(),
      orders: this.getAllOrders(),
      contacts: this.getAllContacts(),
      exportedAt: new Date().toISOString()
    };
  }
};

module.exports = DB;
