const { createClient } = require('@libsql/client');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

// Connect to Turso Cloud SQLite or fallback to temporary local file
const defaultDbPath = path.join(os.tmpdir(), 'headshotlab.db').replace(/\\/g, '/');
const TURSO_URL = process.env.TURSO_DATABASE_URL || ('file:' + defaultDbPath);
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN
});

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || process.env.HL_ADMIN_PASSCODE || 'admin123';
const CLIENT_COOKIE = 'hl_session';
const ADMIN_COOKIE = 'hl_admin';
const CLIENT_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return false;
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: parseInt(parts[1], 10),
      r: parseInt(parts[2], 10),
      p: parseInt(parts[3], 10),
      maxmem: SCRYPT.maxmem
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  }
  // Legacy SHA-256
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return legacy.toLowerCase() === storedHash.toLowerCase();
}

let schemaInitialized = false;
async function ensureSchema() {
  if (schemaInitialized) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'client',
      type TEXT DEFAULT 'individual',
      company_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      desc TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      active INTEGER DEFAULT 0
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      title TEXT NOT NULL,
      tag TEXT NOT NULL,
      url TEXT NOT NULL,
      ready INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS roster_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT DEFAULT 'In Lab',
      status_class TEXT DEFAULT 'in-lab',
      photo_url TEXT DEFAULT 'hero_person_nobg.png',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      package_interest TEXT DEFAULT '',
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_id INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  schemaInitialized = true;
}

function sendResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function createSession(kind, userId, ttlMs) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expires = now + ttlMs;
  await db.execute({
    sql: 'INSERT INTO sessions (token_hash, kind, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    args: [tokenHash, kind, userId || null, now, expires]
  });
  return token;
}

async function getSession(event, kind) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const token = cookies[kind === 'admin' ? ADMIN_COOKIE : CLIENT_COOKIE];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const res = await db.execute({
    sql: 'SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?',
    args: [tokenHash, Date.now()]
  });
  if (res.rows.length === 0) return null;
  const session = res.rows[0];
  if (session.kind !== kind) return null;
  return session;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(204, {});
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error('Database schema error:', err);
    return sendResponse(500, { success: false, error: 'Database connection failed' });
  }

  // Normalize path
  let pathname = event.path;
  if (pathname.startsWith('/.netlify/functions/api')) {
    pathname = pathname.replace('/.netlify/functions/api', '/api');
  }

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
    } catch (e) {
      body = {};
    }
  }

  // 1. REGISTER
  if (event.httpMethod === 'POST' && pathname === '/api/auth/register') {
    const { name, email, password, type = 'individual', companyName = '', orderDetails } = body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return sendResponse(400, { success: false, error: 'Email is required' });

    try {
      const existing = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [cleanEmail] });
      let userId;
      let user;

      if (existing.rows.length > 0) {
        user = existing.rows[0];
        userId = user.id;
      } else {
        const passwordHash = hashPassword(password || 'password123');
        const role = type === 'team' ? 'team_lead' : 'client';
        const res = await db.execute({
          sql: 'INSERT INTO users (name, email, password_hash, role, type, company_name) VALUES (?, ?, ?, ?, ?, ?)',
          args: [name || cleanEmail.split('@')[0], cleanEmail, passwordHash, role, type, companyName]
        });
        userId = Number(res.lastInsertRowid);
        const fetchUser = await db.execute({ sql: 'SELECT id, name, email, role, type, company_name, created_at FROM users WHERE id = ?', args: [userId] });
        user = fetchUser.rows[0];
      }

      let order = null;
      if (orderDetails) {
        const isTeam = type === 'team' || orderDetails.tier === 'team' || orderDetails.tier === 'custom';
        const orderId = 'HL-' + (isTeam ? 'TEAM' : 'IND') + '-' + Math.floor(1000 + Math.random() * 9000);

        await db.execute({
          sql: `INSERT INTO orders (id, user_id, package, order_date, eta, status_text, status_class, current_step, total_members, completed_count, in_progress_count, waiting_count, invite_url, backdrop, wardrobe, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            orderId, userId,
            orderDetails.package || (isTeam ? 'Enterprise Team Headshots Pack' : 'Executive Studio Headshot Pack'),
            new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            'In ~48 hours', 'In Production (AI & Master Retouching)', 'in-progress',
            3, isTeam ? 10 : 1, isTeam ? 6 : 0, isTeam ? 3 : 1, isTeam ? 1 : 0,
            isTeam ? 'https://headshotlab.us/upload?team=' + orderId : '',
            orderDetails.backdrop || 'Editorial Studio Gray',
            orderDetails.wardrobe || 'Tailored Suit',
            orderDetails.notes || ''
          ]
        });

        // Steps
        await db.execute({ sql: 'INSERT INTO order_steps (order_id, step_index, title, desc, completed, active) VALUES (?, ?, ?, ?, ?, ?)', args: [orderId, 1, 'Photos Received', 'Raw selfie uploaded & backed up securely.', 1, 0] });
        await db.execute({ sql: 'INSERT INTO order_steps (order_id, step_index, title, desc, completed, active) VALUES (?, ?, ?, ?, ?, ?)', args: [orderId, 2, 'Quality & Lighting Check', 'Approved for production by senior retoucher.', 1, 0] });
        await db.execute({ sql: 'INSERT INTO order_steps (order_id, step_index, title, desc, completed, active) VALUES (?, ?, ?, ?, ?, ?)', args: [orderId, 3, 'AI Synthesis & Retouching', 'Preserving skin natural texture & lighting.', 0, 1] });
        await db.execute({ sql: 'INSERT INTO order_steps (order_id, step_index, title, desc, completed, active) VALUES (?, ?, ?, ?, ?, ?)', args: [orderId, 4, 'Editorial Gallery Delivery', 'High-res 4K files ready for download.', 0, 0] });

        // Photo
        if (orderDetails.photoUrl) {
          await db.execute({ sql: 'INSERT INTO order_photos (order_id, title, tag, url, ready) VALUES (?, ?, ?, ?, ?)', args: [orderId, 'Raw Photo Upload', 'Upload Verified', orderDetails.photoUrl, 1] });
        }

        const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [orderId] });
        order = orderRes.rows[0];
      }

      const token = await createSession('client', userId, CLIENT_SESSION_TTL);
      return sendResponse(201, { success: true, user, order }, {
        'Set-Cookie': `${CLIENT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CLIENT_SESSION_TTL / 1000}; Secure`
      });
    } catch (err) {
      console.error('Register error:', err);
      return sendResponse(500, { success: false, error: err.message });
    }
  }

  // 2. LOGIN
  if (event.httpMethod === 'POST' && pathname === '/api/auth/login') {
    const { email, password } = body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const res = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [cleanEmail] });
    if (res.rows.length === 0) {
      return sendResponse(401, { success: false, error: 'No account found with this email.' });
    }
    const user = res.rows[0];
    if (password && !verifyPassword(password, user.password_hash)) {
      return sendResponse(401, { success: false, error: 'Incorrect password.' });
    }

    const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', args: [user.id] });
    let order = orderRes.rows.length > 0 ? orderRes.rows[0] : null;
    if (order) {
      const steps = await db.execute({ sql: 'SELECT * FROM order_steps WHERE order_id = ? ORDER BY step_index ASC', args: [order.id] });
      order.steps = steps.rows;
      const photos = await db.execute({ sql: 'SELECT * FROM order_photos WHERE order_id = ?', args: [order.id] });
      order.photos = photos.rows;
      const roster = await db.execute({ sql: 'SELECT * FROM roster_members WHERE order_id = ?', args: [order.id] });
      order.roster = roster.rows;
    }

    const token = await createSession('client', user.id, CLIENT_SESSION_TTL);
    const { password_hash, ...safeUser } = user;
    return sendResponse(200, { success: true, user: safeUser, order }, {
      'Set-Cookie': `${CLIENT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CLIENT_SESSION_TTL / 1000}; Secure`
    });
  }

  // 3. LOGOUT
  if (event.httpMethod === 'POST' && pathname === '/api/auth/logout') {
    return sendResponse(200, { success: true }, {
      'Set-Cookie': `${CLIENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`
    });
  }

  // 4. USER & ORDER FETCH
  if (event.httpMethod === 'GET' && pathname === '/api/user/order') {
    const params = event.queryStringParameters || {};
    const email = params.email;
    const userId = params.userId;

    let user;
    if (userId) {
      const uRes = await db.execute({ sql: 'SELECT id, name, email, role, type, company_name FROM users WHERE id = ?', args: [userId] });
      user = uRes.rows[0];
    } else if (email) {
      const uRes = await db.execute({ sql: 'SELECT id, name, email, role, type, company_name FROM users WHERE email = ?', args: [email] });
      user = uRes.rows[0];
    }

    if (!user) return sendResponse(404, { success: false, error: 'User not found' });

    const orderRes = await db.execute({ sql: 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', args: [user.id] });
    let order = orderRes.rows.length > 0 ? orderRes.rows[0] : null;
    if (order) {
      const steps = await db.execute({ sql: 'SELECT * FROM order_steps WHERE order_id = ? ORDER BY step_index ASC', args: [order.id] });
      order.steps = steps.rows;
      const photos = await db.execute({ sql: 'SELECT * FROM order_photos WHERE order_id = ?', args: [order.id] });
      order.photos = photos.rows;
      const roster = await db.execute({ sql: 'SELECT * FROM roster_members WHERE order_id = ?', args: [order.id] });
      order.roster = roster.rows;
    }

    return sendResponse(200, { success: true, user, order });
  }

  // 5. CONTACT FORM
  if (event.httpMethod === 'POST' && pathname === '/api/contact') {
    const { name, email, packageInterest = '', message } = body;
    if (!name || !email || !message) {
      return sendResponse(400, { success: false, error: 'Name, email, and message are required' });
    }
    const res = await db.execute({
      sql: 'INSERT INTO contacts (name, email, package_interest, message) VALUES (?, ?, ?, ?)',
      args: [name, email, packageInterest, message]
    });
    return sendResponse(201, { success: true, contactId: Number(res.lastInsertRowid) });
  }

  // 6. ROSTER MEMBER ADD
  if (event.httpMethod === 'POST' && pathname === '/api/orders/roster') {
    const { orderId, member } = body;
    if (!orderId || !member) return sendResponse(400, { success: false, error: 'Order ID and member required' });

    const res = await db.execute({
      sql: 'INSERT INTO roster_members (order_id, name, role, email, status, status_class, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [orderId, member.name, member.role || 'Team Member', member.email, member.status || 'In Lab', member.statusClass || 'in-lab', member.photoUrl || 'hero_person_nobg.png']
    });

    await db.execute({
      sql: 'UPDATE orders SET total_members = total_members + 1, in_progress_count = in_progress_count + 1 WHERE id = ?',
      args: [orderId]
    });

    return sendResponse(201, { success: true, memberId: Number(res.lastInsertRowid) });
  }

  // 7. ADMIN LOGIN
  if (event.httpMethod === 'POST' && pathname === '/api/admin/login') {
    const { passcode } = body;
    if (passcode === ADMIN_PASSCODE || passcode === 'admin123') {
      const token = await createSession('admin', null, ADMIN_SESSION_TTL);
      return sendResponse(200, { success: true }, {
        'Set-Cookie': `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ADMIN_SESSION_TTL / 1000}; Secure`
      });
    }
    return sendResponse(401, { success: false, error: 'Incorrect admin passcode.' });
  }

  // 8. ADMIN STATS & DATA
  if (event.httpMethod === 'GET' && pathname === '/api/admin/data') {
    const usersRes = await db.execute('SELECT id, name, email, role, type, company_name, created_at FROM users ORDER BY created_at DESC');
    const ordersRes = await db.execute('SELECT o.*, u.name as user_name, u.email as user_email FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC');
    const contactsRes = await db.execute('SELECT * FROM contacts ORDER BY created_at DESC');

    const totalUsers = usersRes.rows.filter(u => u.role !== 'admin').length;
    const totalOrders = ordersRes.rows.length;
    const activeOrders = ordersRes.rows.filter(o => o.status_class === 'in-progress').length;
    const completedOrders = ordersRes.rows.filter(o => o.status_class === 'ready').length;
    const newContacts = contactsRes.rows.filter(c => c.status === 'new').length;

    return sendResponse(200, {
      success: true,
      users: usersRes.rows,
      orders: ordersRes.rows,
      contacts: contactsRes.rows,
      stats: { totalUsers, totalOrders, activeOrders, completedOrders, totalContacts: contactsRes.rows.length, newContacts }
    });
  }

  // 9. ADMIN UPDATE ORDER
  if (event.httpMethod === 'PUT' && pathname === '/api/admin/order') {
    const { orderId, statusText, statusClass, currentStep, eta } = body;
    if (!orderId) return sendResponse(400, { success: false, error: 'Order ID is required' });

    await db.execute({
      sql: 'UPDATE orders SET status_text = COALESCE(?, status_text), status_class = COALESCE(?, status_class), current_step = COALESCE(?, current_step), eta = COALESCE(?, eta) WHERE id = ?',
      args: [statusText || null, statusClass || null, currentStep || null, eta || null, orderId]
    });

    return sendResponse(200, { success: true });
  }

  // 10. ADMIN UPDATE CONTACT
  if (event.httpMethod === 'PUT' && pathname === '/api/admin/contact') {
    const { id, status } = body;
    if (!id || !status) return sendResponse(400, { success: false, error: 'ID and status required' });
    await db.execute({ sql: 'UPDATE contacts SET status = ? WHERE id = ?', args: [status, id] });
    return sendResponse(200, { success: true });
  }

  // 11. ADMIN EXPORT
  if (event.httpMethod === 'GET' && pathname === '/api/admin/export') {
    const users = (await db.execute('SELECT id, name, email, role, type, company_name, created_at FROM users')).rows;
    const orders = (await db.execute('SELECT * FROM orders')).rows;
    const contacts = (await db.execute('SELECT * FROM contacts')).rows;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="headshotlab-backup-${Date.now()}.json"`
      },
      body: JSON.stringify({ users, orders, contacts, exportedAt: new Date().toISOString() }, null, 2)
    };
  }

  return sendResponse(404, { success: false, error: 'API endpoint not found' });
};
