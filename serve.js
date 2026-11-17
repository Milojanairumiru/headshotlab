const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DB = require('./db');

// Optional local .env file (never served, blocked by the static filter).
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(path.join(__dirname, '.env'));
  }
} catch (err) {
  // No .env file is fine; environment variables still work.
}

const PORT = parseInt(process.env.PORT, 10) || 8080;

// Admin access is a server-side passcode supplied by the environment.
// Defaults to 'admin123' if unset, and can be customized via ADMIN_PASSCODE.
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || process.env.HL_ADMIN_PASSCODE || 'admin123';
const ADMIN_PASSCODE_DIGEST = ADMIN_PASSCODE
  ? crypto.createHash('sha256').update(ADMIN_PASSCODE).digest()
  : null;

const CLIENT_COOKIE = 'hl_session';
const ADMIN_COOKIE = 'hl_admin';
const CLIENT_SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;       // 8 hours
const MAX_BODY_BYTES = 50 * 1024 * 1024;            // base64 photo uploads

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const BLOCKED_FILES = new Set([
  'serve.js',
  'db.js',
  'package.json',
  'package-lock.json',
  'start-local-site.bat',
  'pre-launch-security.md'
]);
const BLOCKED_DIRS = ['data', 'node_modules', 'wordpress-backups', 'scripts'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(value);
    } catch (err) {
      out[key] = value;
    }
  });
  return out;
}

function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === '1') return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function setSessionCookie(req, res, name, token, ttlMs) {
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(ttlMs / 1000)}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res, name) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getSession(req, kind) {
  const cookies = parseCookies(req);
  const raw = cookies[kind === 'admin' ? ADMIN_COOKIE : CLIENT_COOKIE];
  if (!raw) return null;
  const session = DB.getSession(raw);
  if (!session || session.kind !== kind) return null;
  if (kind === 'client' && !session.user_id) return null;
  return session;
}

function requireAdmin(req, res) {
  const session = getSession(req, 'admin');
  if (!session) {
    sendJson(res, 401, { success: false, error: 'Admin authentication required.' });
    return null;
  }
  return session;
}

function requireClient(req, res) {
  const session = getSession(req, 'client');
  if (!session || !session.user_id) {
    sendJson(res, 401, { success: false, error: 'Please sign in to continue.' });
    return null;
  }
  return session;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'default123', 'admin123', 'admin',
  '12345678', '123456789', 'qwerty123', 'letmein', 'welcome123', 'headshot123'
]);

function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

const rateBuckets = new Map();

// Returns 0 when allowed, or the number of seconds to wait.
function rateLimit(req, bucket, max, windowMs) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  let record = rateBuckets.get(key);
  if (!record || record.resetAt <= now) {
    record = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, record);
  }
  record.count += 1;
  if (record.count > max) {
    return Math.ceil((record.resetAt - now) / 1000);
  }
  return 0;
}

function clearRateLimit(req, bucket) {
  rateBuckets.delete(`${bucket}:${clientIp(req)}`);
}

function sanitizePhotoUrl(value) {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(url)) {
    return url;
  }
  if (/^assets\/[A-Za-z0-9._-]+$/.test(url)) {
    return url;
  }
  if (/^https:\/\/[^\s"'<>]{1,2000}$/i.test(url)) {
    return url;
  }
  return '';
}

function generateOrderId(isTeam) {
  const prefix = 'HL-' + (isTeam ? 'TEAM' : 'IND') + '-';
  for (let i = 0; i < 20; i++) {
    const candidate = prefix + Math.floor(1000 + Math.random() * 9000);
    if (!DB.orderExists(candidate)) return candidate;
  }
  return prefix + Date.now().toString().slice(-6);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    type: user.type,
    company_name: user.company_name
  };
}

// A same-origin JSON app does not need CORS. Reject state-changing requests
// whose Origin does not match the Host header.
function isCrossSite(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host !== String(req.headers.host || '');
  } catch (err) {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------
async function handleRegister(req, res) {
  const retry = rateLimit(req, 'register', 20, 60 * 60 * 1000);
  if (retry) {
    return sendJson(res, 429, { success: false, error: 'Too many attempts. Try again later.' });
  }

  const data = await parseJsonBody(req);
  const name = String(data.name || '').trim().slice(0, 120);
  const email = normalizeEmail(data.email);
  const password = typeof data.password === 'string' ? data.password : '';
  const type = data.type === 'team' ? 'team' : 'individual';
  const companyName = String(data.companyName || '').trim().slice(0, 160);
  const orderDetails = data.orderDetails && typeof data.orderDetails === 'object' ? data.orderDetails : {};

  if (!isValidEmail(email)) {
    return sendJson(res, 400, { success: false, error: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return sendJson(res, 400, { success: false, error: 'Password must be at least 8 characters.' });
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return sendJson(res, 400, { success: false, error: 'Choose a stronger password.' });
  }
  if (DB.getUserByEmail(email)) {
    return sendJson(res, 409, { success: false, error: 'An account with this email already exists. Please sign in.' });
  }

  const isTeam = type === 'team' || orderDetails.tier === 'team' || orderDetails.tier === 'custom';
  const role = isTeam ? 'team_lead' : 'client';
  const displayName = name || email.split('@')[0];

  let user;
  try {
    user = DB.createUser({
      name: displayName,
      email,
      password,
      role,
      type: isTeam ? 'team' : 'individual',
      companyName: companyName || (isTeam ? `${displayName}'s Team` : '')
    });
  } catch (err) {
    // UNIQUE constraint race
    return sendJson(res, 409, { success: false, error: 'An account with this email already exists. Please sign in.' });
  }

  const photoUrl = sanitizePhotoUrl(orderDetails.photoUrl);
  const photos = [];
  if (photoUrl) {
    photos.push({ title: 'Raw Photo Upload', tag: 'Upload Verified', url: photoUrl, ready: 1 });
    photos.push({ title: 'Look 1: Master Retouching', tag: 'In Progress', url: 'hero_person_nobg.png', ready: 0 });
  }

  // Only the real account holder goes on the roster. No placeholder teammates.
  const roster = isTeam ? [{
    name: displayName,
    role: 'Team Lead',
    email,
    status: photoUrl ? 'In Lab' : 'Awaiting Upload',
    statusClass: photoUrl ? 'in-lab' : 'waiting',
    photoUrl: photoUrl || 'hero_person_nobg.png'
  }] : [];

  let order = null;
  if (orderDetails && Object.keys(orderDetails).length > 0) {
    const orderId = generateOrderId(isTeam);
    order = DB.createOrder({
      id: orderId,
      userId: user.id,
      package: String(orderDetails.package || (isTeam ? 'Enterprise Team Headshots Pack' : 'Executive Studio Headshot Pack')).slice(0, 200),
      orderDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      eta: 'In ~48 hours',
      statusText: 'In Production (AI & Master Retouching)',
      statusClass: 'in-progress',
      currentStep: 3,
      totalMembers: isTeam ? roster.length : 1,
      completedCount: 0,
      inProgressCount: photoUrl ? 1 : 0,
      waitingCount: photoUrl ? 0 : 1,
      inviteUrl: isTeam ? 'https://headshotlab.us/upload?team=' + orderId : '',
      backdrop: String(orderDetails.backdrop || 'Editorial Studio Gray').slice(0, 120),
      wardrobe: String(orderDetails.wardrobe || 'Tailored Suit').slice(0, 120),
      notes: String(orderDetails.notes || '').slice(0, 4000),
      photos,
      roster
    });
  }

  const token = DB.createSession('client', user.id, CLIENT_SESSION_TTL);
  setSessionCookie(req, res, CLIENT_COOKIE, token, CLIENT_SESSION_TTL);

  return sendJson(res, 201, { success: true, user: publicUser(user), order });
}

async function handleLogin(req, res) {
  const retry = rateLimit(req, 'login', 10, 15 * 60 * 1000);
  if (retry) {
    res.setHeader('Retry-After', String(retry));
    return sendJson(res, 429, { success: false, error: 'Too many sign-in attempts. Try again later.' });
  }

  const data = await parseJsonBody(req);
  const email = normalizeEmail(data.email);
  const password = typeof data.password === 'string' ? data.password : '';

  if (!isValidEmail(email) || !password) {
    return sendJson(res, 400, { success: false, error: 'Enter your email and password.' });
  }

  const existing = DB.getUserByEmail(email);
  if (existing && existing.role === 'admin') {
    return sendJson(res, 403, { success: false, error: 'Use the admin console to sign in.' });
  }

  const user = DB.authenticate(email, password);
  if (!user) {
    return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
  }

  clearRateLimit(req, 'login');
  const token = DB.createSession('client', user.id, CLIENT_SESSION_TTL);
  setSessionCookie(req, res, CLIENT_COOKIE, token, CLIENT_SESSION_TTL);

  return sendJson(res, 200, {
    success: true,
    user: publicUser(user),
    order: DB.getOrderByUserId(user.id)
  });
}

function handleLogout(req, res) {
  const cookies = parseCookies(req);
  const raw = cookies[CLIENT_COOKIE];
  if (raw) DB.deleteSessionByToken(raw);
  clearSessionCookie(req, res, CLIENT_COOKIE);
  return sendJson(res, 200, { success: true });
}

function handleMe(req, res) {
  const session = requireClient(req, res);
  if (!session) return;
  const user = DB.getUserById(session.user_id);
  if (!user) {
    clearSessionCookie(req, res, CLIENT_COOKIE);
    return sendJson(res, 401, { success: false, error: 'Session expired. Please sign in.' });
  }
  return sendJson(res, 200, { success: true, user: publicUser(user), order: DB.getOrderByUserId(user.id) });
}

function handleUserOrder(req, res) {
  const session = requireClient(req, res);
  if (!session) return;
  const user = DB.getUserById(session.user_id);
  if (!user) {
    return sendJson(res, 404, { success: false, error: 'User not found' });
  }
  return sendJson(res, 200, { success: true, user: publicUser(user), order: DB.getOrderByUserId(user.id) });
}

async function handleRosterAdd(req, res) {
  const session = requireClient(req, res);
  if (!session) return;

  const user = DB.getUserById(session.user_id);
  if (!user) {
    return sendJson(res, 404, { success: false, error: 'User not found' });
  }
  if (user.type !== 'team') {
    return sendJson(res, 403, { success: false, error: 'Only team accounts can add roster members.' });
  }

  const data = await parseJsonBody(req);
  const orderId = String(data.orderId || '');
  const member = data.member && typeof data.member === 'object' ? data.member : {};

  const order = DB.getOrderById(orderId);
  if (!order || order.user_id !== user.id) {
    return sendJson(res, 403, { success: false, error: 'You do not have access to this order.' });
  }

  const memberName = String(member.name || '').trim().slice(0, 120);
  const memberEmail = normalizeEmail(member.email);
  const memberRole = String(member.role || 'Member').trim().slice(0, 120);

  if (!memberName || !isValidEmail(memberEmail)) {
    return sendJson(res, 400, { success: false, error: 'A member name and valid email are required.' });
  }

  const memberId = DB.addRosterMember(orderId, {
    name: memberName,
    role: memberRole,
    email: memberEmail,
    status: 'In Lab',
    statusClass: 'in-lab',
    photoUrl: sanitizePhotoUrl(member.photoUrl) || 'hero_person_nobg.png'
  });

  return sendJson(res, 201, { success: true, memberId, order: DB.getOrderByUserId(user.id) });
}

async function handleContact(req, res) {
  const retry = rateLimit(req, 'contact', 20, 60 * 60 * 1000);
  if (retry) {
    return sendJson(res, 429, { success: false, error: 'Too many messages. Try again later.' });
  }

  const data = await parseJsonBody(req);
  const name = String(data.name || '').trim().slice(0, 120);
  const email = normalizeEmail(data.email);
  const packageInterest = String(data.packageInterest || '').trim().slice(0, 200);
  const message = String(data.message || '').trim().slice(0, 5000);

  if (!name || !isValidEmail(email) || !message) {
    return sendJson(res, 400, { success: false, error: 'Name, email, and message are required' });
  }

  const contact = DB.createContact({ name, email, packageInterest, message });

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'HeadshotLab <onboarding@resend.dev>',
          to: ['contact@headshotlab.us'],
          reply_to: email,
          subject: `New HeadshotLab Inquiry: ${packageInterest || 'General Inquiry'} from ${name}`,
          text: `New contact form submission from HeadshotLab website:\n\nName: ${name}\nEmail: ${email}\nSubject/Interest: ${packageInterest}\n\nMessage:\n${message}\n\nSubmitted at: ${new Date().toISOString()}`
        })
      });
    } catch (err) {
      console.error('Resend email error:', err);
    }
  }

  return sendJson(res, 201, { success: true, contact, message: 'Inquiry saved successfully' });
}

// ---------------------------------------------------------------------------
// Admin routes (all require an admin session cookie)
// ---------------------------------------------------------------------------
async function handleAdminLogin(req, res) {
  if (!ADMIN_PASSCODE_DIGEST) {
    return sendJson(res, 503, {
      success: false,
      error: 'Admin access is not configured. Set the ADMIN_PASSCODE environment variable and restart the server.'
    });
  }

  const retry = rateLimit(req, 'admin-login', 5, 15 * 60 * 1000);
  if (retry) {
    res.setHeader('Retry-After', String(retry));
    return sendJson(res, 429, { success: false, error: 'Too many attempts. Try again later.' });
  }

  const data = await parseJsonBody(req);
  const passcode = typeof data.passcode === 'string' ? data.passcode : '';
  const digest = crypto.createHash('sha256').update(passcode).digest();
  const ok = passcode.length > 0
    && digest.length === ADMIN_PASSCODE_DIGEST.length
    && crypto.timingSafeEqual(digest, ADMIN_PASSCODE_DIGEST);

  if (!ok) {
    return sendJson(res, 401, { success: false, error: 'Invalid passcode.' });
  }

  clearRateLimit(req, 'admin-login');
  const token = DB.createSession('admin', null, ADMIN_SESSION_TTL);
  setSessionCookie(req, res, ADMIN_COOKIE, token, ADMIN_SESSION_TTL);
  return sendJson(res, 200, { success: true });
}

function handleAdminLogout(req, res) {
  const cookies = parseCookies(req);
  const raw = cookies[ADMIN_COOKIE];
  if (raw) DB.deleteSessionByToken(raw);
  clearSessionCookie(req, res, ADMIN_COOKIE);
  return sendJson(res, 200, { success: true });
}

function handleAdminMe(req, res) {
  if (!requireAdmin(req, res)) return;
  return sendJson(res, 200, { success: true });
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (err) {
    return null;
  }

  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^\/+/, '');
  if (!relative) return null;

  const segments = relative.split(/[\\/]+/);
  if (segments.some(segment => segment === '..' || segment === '.' || segment === '')) {
    return null;
  }

  const lower = relative.toLowerCase();
  if (BLOCKED_DIRS.some(dir => lower === dir || lower.startsWith(dir + '/'))) return null;
  if (BLOCKED_FILES.has(lower)) return null;
  if (segments.some(segment => segment.startsWith('.'))) return null;
  if (/\.(db|sqlite|sqlite3|bat|cmd|ps1|sh|log|env|md)$/i.test(lower)) return null;

  const root = path.resolve(__dirname);
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;

  return absolute;
}

function serveStatic(req, res, pathname) {
  let reqPath = pathname;
  if (reqPath === '/') reqPath = '/index.html';
  if (reqPath === '/admin') reqPath = '/admin.html';
  if (reqPath === '/portal' || reqPath === '/track') reqPath = '/track.html';

  const filePath = resolveStaticPath(reqPath);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('File Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('File Not Found');
      } else {
        console.error('Static file error:', err.code);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Server Error');
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(content);
  });
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // No cross-origin API access. Preflight gets a bare 204 with no CORS grants.
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && isCrossSite(req)) {
    return sendJson(res, 403, { success: false, error: 'Cross-site request refused.' });
  }

  try {
    // ---- auth ----
    if (req.method === 'POST' && pathname === '/api/auth/register') return await handleRegister(req, res);
    if (req.method === 'POST' && pathname === '/api/auth/login') return await handleLogin(req, res);
    if (req.method === 'POST' && pathname === '/api/auth/logout') return handleLogout(req, res);
    if (req.method === 'GET' && pathname === '/api/auth/me') return handleMe(req, res);

    // ---- client ----
    if (req.method === 'GET' && pathname === '/api/user/order') return handleUserOrder(req, res);
    if (req.method === 'POST' && pathname === '/api/orders/roster') return await handleRosterAdd(req, res);

    // ---- public ----
    if (req.method === 'POST' && pathname === '/api/contact') return await handleContact(req, res);

    // ---- admin ----
    if (req.method === 'POST' && pathname === '/api/admin/login') return await handleAdminLogin(req, res);
    if (req.method === 'POST' && pathname === '/api/admin/logout') return handleAdminLogout(req, res);
    if (req.method === 'GET' && pathname === '/api/admin/me') return handleAdminMe(req, res);

    if (pathname.startsWith('/api/admin/')) {
      if (!requireAdmin(req, res)) return;

      if (req.method === 'GET' && pathname === '/api/admin/stats') {
        return sendJson(res, 200, { success: true, stats: DB.getStats() });
      }

      if (req.method === 'GET' && pathname === '/api/admin/data') {
        const users = DB.getAllUsers();
        const orders = DB.getAllOrders();
        const contacts = DB.getAllContacts();
        return sendJson(res, 200, { success: true, users, orders, contacts, stats: DB.getStats() });
      }

      if (req.method === 'PUT' && pathname === '/api/admin/order') {
        const data = await parseJsonBody(req);
        const orderId = String(data.orderId || '');
        if (!orderId) {
          return sendJson(res, 400, { success: false, error: 'Order ID is required' });
        }
        if (!DB.getOrderById(orderId)) {
          return sendJson(res, 404, { success: false, error: 'Order not found' });
        }
        const updates = {};
        if (data.statusText !== undefined) updates.statusText = String(data.statusText).slice(0, 200);
        if (data.statusClass !== undefined) updates.statusClass = String(data.statusClass).slice(0, 40);
        if (data.currentStep !== undefined) updates.currentStep = parseInt(data.currentStep, 10) || 1;
        if (data.completedCount !== undefined) updates.completedCount = parseInt(data.completedCount, 10) || 0;
        if (data.inProgressCount !== undefined) updates.inProgressCount = parseInt(data.inProgressCount, 10) || 0;
        if (data.waitingCount !== undefined) updates.waitingCount = parseInt(data.waitingCount, 10) || 0;
        if (data.eta !== undefined) updates.eta = String(data.eta).slice(0, 200);
        return sendJson(res, 200, { success: true, order: DB.updateOrderStatus(orderId, updates) });
      }

      if (req.method === 'PUT' && pathname === '/api/admin/contact') {
        const data = await parseJsonBody(req);
        const id = parseInt(data.id, 10);
        const status = String(data.status || '');
        if (!id || !['new', 'replied'].includes(status)) {
          return sendJson(res, 400, { success: false, error: 'A valid ID and status are required' });
        }
        return sendJson(res, 200, { success: true, contact: DB.updateContactStatus(id, status) });
      }

      if (req.method === 'GET' && pathname === '/api/admin/export') {
        const fullExport = DB.exportAll();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=UTF-8',
          'Content-Disposition': `attachment; filename="headshotlab-backup-${Date.now()}.json"`,
          'Cache-Control': 'no-store'
        });
        return res.end(JSON.stringify(fullExport, null, 2));
      }

      return sendJson(res, 404, { success: false, error: 'Not found' });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { success: false, error: 'Not found' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { success: false, error: 'Method not allowed' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    if (err && err.message === 'Payload too large') {
      return sendJson(res, 413, { success: false, error: 'Upload is too large.' });
    }
    if (err instanceof SyntaxError) {
      return sendJson(res, 400, { success: false, error: 'Invalid JSON body.' });
    }
    console.error('Request error:', err);
    return sendJson(res, 500, { success: false, error: 'Server error' });
  }
});

function startServer(portToTry) {
  server.listen(portToTry, '0.0.0.0', () => {
    console.log('\n======================================================');
    console.log(`  HeadshotLab Server with Database running at:`);
    console.log(`  👉 Website:        http://localhost:${portToTry}`);
    console.log(`  👉 Client Portal:  http://localhost:${portToTry}/portal`);
    console.log(`  👉 Admin Panel:    http://localhost:${portToTry}/admin`);
    console.log(`  📁 Database:       ${DB.path}`);
    console.log(`  🔐 Admin passcode: ${ADMIN_PASSCODE_DIGEST ? 'configured' : 'NOT SET (admin login disabled)'}`);
    console.log('======================================================\n');
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT to a free port or stop the other process.`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

// Housekeeping: drop expired sessions once an hour.
setInterval(() => {
  try {
    DB.deleteExpiredSessions();
  } catch (err) {
    console.error('Session cleanup failed:', err.message);
  }
}, 60 * 60 * 1000).unref();

startServer(PORT);
