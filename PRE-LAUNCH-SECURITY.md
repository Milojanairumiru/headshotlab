# Pre-Launch Security Report — HeadshotLab

Date: 11 November 2026
Scope: `D:\Projects\006_HeadshotLab\HL Website` (local site, portal, admin console, SQLite data layer)
Backup taken before any edit: `D:\Projects\006_HeadshotLab\HL Website_backup_2026-11-11` (107 files, 18.7 MB)

The server on port 8080 was running when this work began. It was **not** restarted or modified
during the work, and all tests ran on 8090 against a copy of the database. At the end of the
session the 8080 process was found to have stopped on its own (the test instances ran separately on
8090). With the founder's approval it was then started again on 8080 with the fixed code and a
generated `ADMIN_PASSCODE` in `.env`; a 15-check live smoke test passed (section 2).

---

## 1. What was fixed

### Finding 1 — `/api/admin/*` had no authentication (CRITICAL)
- Every admin endpoint now requires a valid admin session cookie:
  `GET /api/admin/data`, `GET /api/admin/stats`, `GET /api/admin/export`,
  `PUT /api/admin/order`, `PUT /api/admin/contact`.
- Unauthenticated requests get `401` and no client data.
- The export endpoint no longer includes password hashes (it never should have; `getAllUsers`
  already excluded them, and that is now asserted in tests).
- Admin sessions are separate from client sessions (`hl_admin` vs `hl_session`) and expire after
  8 hours.

### Finding 2 — admin gate was client-side with a hardcoded passcode (CRITICAL)
- Removed `sessionStorage`, the `"unlocked"` flag and all comparisons against `admin123` / `admin`.
- Removed the passcode hint and `placeholder="e.g. admin123"` from `admin.html`.
- Admin login is now `POST /api/admin/login` with the passcode compared server-side in constant time
  against the `ADMIN_PASSCODE` environment variable.
- **No default passcode exists.** If `ADMIN_PASSCODE` is not set, admin login returns `503` and the
  console cannot be opened at all.
- Admin logout is `POST /api/admin/logout`, which deletes the server-side session.
- Brute force is limited to 5 attempts per IP per 15 minutes (in-memory).

### Finding 3 — login auto-created accounts and accepted default passwords (CRITICAL)
- `POST /api/auth/login` no longer creates users. Unknown email → `401`.
- Removed the `default123` / `password123` bypass entirely. Passwords are verified against the
  stored hash only.
- Passwords now use **scrypt** with a random 16-byte per-user salt
  (`scrypt$N$r$p$salt$hash`, N=16384, r=8, p=1, 64-byte key).
- Old unsalted SHA-256 rows are accepted once with the correct password, then transparently
  upgraded to scrypt on that successful sign-in.
- Registration requires a unique email, a password of at least 8 characters, and rejects a small
  list of known-weak passwords.
- Login and registration are rate limited (10 attempts / 15 min and 20 / hour per IP, in-memory).
- Admin accounts cannot sign in through the client portal (`403`), so the old `admin@…` row with
  `admin123` is no longer a usable entry point even before it is purged.

### Finding 4 — fake roster members on team orders (HIGH)
- Removed `Sarah Jenkins`, `Alex Vance` and `Michael Chen` from the registration flow.
- A new team order's roster contains only the account holder (the real team lead).
- The earlier database seeder (which created fake clients David Vance / Marcus Vance, fake orders
  and a fake 4-person team roster) is removed from `db.js`. New databases start empty.
- Existing demo rows already in the live database are **not** deleted automatically. A reviewed
  cleanup script is provided (see section 5).
- Order counts on registration now match the real roster (`total_members = 1`, zero completed).
- `POST /api/orders/roster` now requires a client session and checks that the order belongs to that
  user; a client cannot write into another client's order (tested: `403`).
- Member name/email are validated and length-limited.

### Finding 5 — surrounding weaknesses (HIGH)
- **CORS:** removed `Access-Control-Allow-Origin: *` from all responses and preflights. The app is
  same-origin; no CORS grant is needed. State-changing requests with a foreign `Origin` are
  rejected with `403` (defence in depth alongside `SameSite=Lax` cookies).
- **Static file traversal:** decoded path is rejected if it contains `..`, null bytes, dotfiles, or
  resolves outside the project root. `data/`, `node_modules/`, `wordpress-backups/`, `.db` files,
  `.env`, `.bat`/`.md`/`.log`, `serve.js` and `db.js` are not served. `/data/headshotlab.db` is no
  longer downloadable.
- **Security headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, restrictive
  `Permissions-Policy`.

### Additional defects found and fixed
- **Order detail queries were broken:** `getOrderByUserId` called
  `stepsQuery.all()`, `photosQuery.all()` and `rosterQuery.all()` without binding `order_id`, so the
  portal always received empty steps, photos and roster for real orders. They now bind `order.id`.
  This is why the fake roster was the only roster anyone ever saw.
- **Portal field mismatch:** the portal reads camelCase (`totalMembers`, `statusText`, …) while
  SQLite returns snake_case. `getOrderByUserId` now exposes camelCase aliases alongside the raw
  columns (admin still uses snake_case).
- **Offline/demo fallbacks removed:** portal and homepage no longer fake a logged-in session or a
  sample dashboard when the API fails. Registration and sign-in now fail closed with a message.
- **Demo login buttons removed** from the portal (they showed fabricated client data without any
  authentication). This is a visible UI change; see "Founder decisions".
- **Order photo URLs sanitised** server-side: only `data:image/(png|jpeg|webp);base64,…`,
  `assets/<safe-name>` or `https://…` are stored (prevents markup injection through the image
  `src`).
- **Order ID collision:** IDs are retried if the random 4-digit suffix already exists.
- **Uploaded/seed photos:** an order with no uploaded photo no longer gets invented placeholder
  photos.
- **Session storage:** only SHA-256 hashes of 32-byte random session tokens are stored in SQLite.
  Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when HTTPS is detected or
  `COOKIE_SECURE=1`.
- **Database path override:** `HL_DB_PATH` lets tests (and production) keep SQLite outside the
  deploy directory.
- **Silent port fallback removed:** if the port is taken the server exits with a clear error
  instead of quietly starting on 8081.

### Files changed
- `db.js` — KDF, sessions, no seeding, bound order-detail queries, camelCase aliases, safe export.
- `serve.js` — server-side auth for admin/client, no CORS, static hardening, body/input limits,
  rate limits, security headers, env loading, `HL_DB_PATH`.
- `admin.html` — server session login/logout, no passcode in the UI.
- `track.html` — HttpOnly session, no demo/offline login, real roster writes, no fake data.
- `index.html` — no default password, no fake local account/roster fallback, registration errors shown.
- `package.json` — start script and `engines: node >=24`.
- `start-local-site.bat` — asks for an admin passcode for the session.
- `.env.example` — documented environment variables.
- `scripts/purge-demo-data.js` — dry-run-by-default demo data cleanup.

---

## 2. How it was tested

Test instance: `PORT=8090`, `HL_DB_PATH=<temp copy of headshotlab.db>`,
`ADMIN_PASSCODE=<test-only value>`, started from the project folder. Port 8080 kept running the
old process against the live database; tests never wrote to `data/headshotlab.db`.

Automated API suite: **59 checks, 59 passed, 0 failed** (`security-test.js`, kept in a temp folder,
not in the project). Coverage:

| Area | Checks |
|---|---|
| Admin API unauthenticated | data, export, order update, `me` all `401`; response contains no client email |
| Admin login | old `admin123` rejected; env passcode accepted; HttpOnly/SameSite cookie; session works; export works; logout ends session |
| Client login | unknown email `401` **and no user row created**; wrong password `401`; `default123` bypass gone; correct legacy password works and upgrades to scrypt; session isolation; email query param cannot read another client; client cannot call admin API |
| Registration | weak password `400`; strong password `201`; duplicate email `409`; registration signs in; scrypt hash stored; session tokens stored hashed |
| Team roster | only the real lead; no Sarah/Alex/Michael; counts truthful; add requires session; cross-order writes `403`; invalid email `400` |
| Static serving | `/data/headshotlab.db`, `/serve.js`, `/db.js`, `%2e%2e` traversal, nested encoded traversal, dotfiles all `404`; homepage/portal/admin still load; admin page contains no `admin123` |
| Headers/CSRF | no wildcard CORS; `nosniff`; preflight grants nothing; cross-site POST `403`; contact email validation |
| Admin mutations | order update works with session only |
| Rate limiting | admin passcode brute force and client login brute force both return `429` |

Real browser check (embedded browser against 8090):
- `/admin` shows the lock screen with no passcode hint and no passcode in source; the env passcode
  opened the dashboard and loaded 4 clients / 4 orders / 1 inquiry.
- `/portal` has no demo-login buttons; signing in as a test client showed the real order
  `#HL-IND-2770`, its milestones and profile, with no console/network errors.

Live smoke test on 8080 after the approved restart: **15 checks, 15 passed** (homepage, portal,
admin unauth `401`, old `admin123` rejected, env passcode accepted, data/export, empty DB after
purge, contact preserved, `/data/*.db` and `.env` and `/scripts/*` `404`, unknown client login `401`,
admin page contains no passcode).

Not tested: Hostinger deployment, real HTTPS cookie behaviour, email delivery, load/concurrency,
multiple server processes, mobile browsers.

---

## 3. What still remains (before real client data)

Priority order. Items 1–4 should be closed before the first paying client.

1. **HTTPS / TLS** — mandatory. Session cookies are only `Secure` when HTTPS is detected, and
   passwords must never cross plain HTTP. Enable the host's free certificate and force HTTPS.
2. **Backups** — nothing schedules or verifies backups of `headshotlab.db` yet. Add a daily copy to
   offsite storage and test a restore. The admin JSON export is not a database backup (it omits
   sessions and any future tables, and is manual).
3. **Email delivery** — there is none. Contact-form submissions are only rows in `contacts`; the
   page says "sent to our team", which is currently false. There is also no email verification, no
   password reset, and no order notification. Add a transactional provider (e.g. Postmark, Resend,
   SES), verify sending domain, and add a reset flow.
4. **Data retention and deletion** — no way to delete a client, close an account, or purge old
   leads/photos. Define retention (e.g. delete source photos N days after delivery), add
   delete/export per client, and publish a privacy policy. US clients: check CCPA obligations and
   your processor agreements. This is a business/legal decision, not only code.
5. **Rate limiting** — current limits are in-memory: they reset on restart and are per process. Set
   `TRUST_PROXY=1` only behind the host's trusted proxy (otherwise every visitor shares one IP and
   limits become global). For real traffic, move limits to the edge (Cloudflare/WAF) or a shared
   store.
6. **Admin identity and audit trail** — one shared passcode means no record of who changed an order.
   Move to per-admin accounts with roles and an append-only audit log of order/contact changes.
   Add 2FA for admins.
7. **Content Security Policy** — not set because all pages use large inline `<script>`/`<style>`
   blocks. Refactor to external files with a nonce/hash before adding a strict CSP.
8. **Upload handling** — photos are base64-encoded into SQLite (50 MB request cap). This bloats the
   database, slows backups, and has no malware scanning or real image validation. Move to object
   storage with signed URLs, virus scanning, and per-plan size limits.
9. **Database operations** — SQLite is single-process and synchronous. Fine for launch volume;
   revisit if the host runs multiple app instances, and enable WAL + a write-retry policy.
10. **Account security extras** — password reset, "sign out everywhere" after a password change,
    optional breach-list check, and login notification emails.
11. **Monitoring** — no uptime check, error alerting, or alert on repeated failed admin logins.
    Add an external uptime monitor and log shipping.
12. **Dependency review** — `jpeg-js` and `pngjs` are declared but not used by the server. Remove
    or document them, and run `npm audit` before deploy.
13. **Registration email enumeration** — `409` reveals whether an email exists. Acceptable for a
    B2B signup, but switch to "check your email" if that matters.
14. **Purge demo rows** — see section 5.

---

## 4. Hostinger deployment steps (exact)

Requirement: a Hostinger plan with Node.js web apps (Business/Cloud), and **Node 24** selected —
the app uses the built-in `node:sqlite` module (local verification was on Node v26.8.1).

### 4.1 Prepare the package locally
1. Generate a production passcode (do not reuse the test one):
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
   Store it in a password manager; never commit it.
2. From `D:\Projects\006_HeadshotLab\HL Website`, zip the app **excluding**:
   `node_modules\`, `data\`, `wordpress-backups\`, `.env`, `*_backup*.html`,
   `index-backup-*.html`, `test-*.html`, and any local logs.
   Include: `serve.js`, `db.js`, `index.html`, `track.html`, `admin.html`, `assets\`,
   `package.json`, `package-lock.json`, `scripts\`.
3. Decide the demo rows (section 5) before uploading the database.

### 4.2 Create the app
1. hPanel → **Websites → Add Website → Node.js web app → Upload your files** (or Git deploy).
2. Build settings:
   - Framework preset: **Other**
   - Node.js version: **24**
   - Build command: *(blank)*
   - Output directory: *(blank)*
   - Entry file: **serve.js**
3. Deploy.

### 4.3 Environment variables (hPanel → app → Environment variables)
| Key | Value |
|---|---|
| `ADMIN_PASSCODE` | the generated passcode |
| `COOKIE_SECURE` | `1` |
| `TRUST_PROXY` | `1` (Hostinger terminates TLS and proxies; keep `0` if that is not true) |
| `HL_DB_PATH` | absolute path outside the build folder, e.g. `/home/<account>/domains/<domain>/data-live/headshotlab.db` |

Do not set `PORT`; Hostinger assigns it. Saving variables redeploys the app.

### 4.4 Persistent database
1. In hPanel File Manager create `<home>/domains/<domain>/data-live/` (outside
   `hbuilds/current`, which is replaced on every deploy).
2. Upload the production `headshotlab.db` there (or start empty). If migrating, stop the app first
   and upload a copy made while nothing was writing.
3. Confirm the path matches `HL_DB_PATH` exactly, then restart the app.
4. Never place the database inside `hbuilds/` or `public_html/`; redeploys would replace or expose it.

### 4.5 TLS and domain
1. Enable the free SSL certificate for the domain and any `www` alias.
2. Turn on "Force HTTPS".
3. Confirm the site loads at `https://…` with no mixed-content warnings, then confirm the session
   cookie has the `Secure` flag (browser devtools → Application → Cookies).

### 4.6 First smoke test
1. `https://<domain>/` returns 200.
2. `https://<domain>/portal` signs up a test account, then signs out and back in.
3. `https://<domain>/admin` rejects `admin123`, accepts the env passcode, loads data, exports JSON,
   then signs out.
4. In a private window, open `https://<domain>/api/admin/data` — must return
   `{"success":false,"error":"Admin authentication required."}`.
5. Open `https://<domain>/data/headshotlab.db` — must return `404 File Not Found`.
6. Create a team test order and confirm the roster contains only the lead.

### 4.7 Backups
1. Schedule a daily copy of `HL_DB_PATH` to storage outside the hosting account.
2. Keep 30 daily + 12 monthly copies; encrypt at rest.
3. Once a month, restore the newest copy into a test path and open the portal against it.

### 4.8 Redeploying later
Code lives in `hbuilds/current`; the database lives in `data-live`. A redeploy therefore keeps
client data. After each deploy: restart the app, run the smoke test, and check that `HL_DB_PATH`
still points at the persistent file.

### 4.9 Rollback
1. Stop the app in hPanel.
2. Restore the previous code from `HL Website_backup_2026-11-11` (or the previous Git build).
3. Restore the database copy taken before the deploy.
4. Start the app and repeat the smoke test.
Note: rolling back to pre-fix code re-opens findings 1–4. Only do it to recover availability, then
redeploy the fixed build.

---

## 5. Demo data cleanup (founder decision)

`scripts/purge-demo-data.js` lists the three seeded accounts and their orders/roster rows. Dry run
by default:

```
node scripts/purge-demo-data.js
node scripts/purge-demo-data.js --apply
```

Current dry-run output against a copy of the live database:
- `admin@headshotlab.com` (old hardcoded admin, unused now)
- `david@acme.io` — 1 order (`HL-IND-8842`)
- `marcus@nexusai.com` — 1 order (`HL-TEAM-4421`), 4 roster rows

Deleting them also removes their orders, photos, roster rows and sessions. Contact inquiries are
never deleted. **Run with founder approval on 11 Nov 2026.** Result: 3 accounts, 2 orders, all
order steps/photos/roster rows and sessions deleted. The live database now has 0 users, 0 orders
and 1 contact inquiry (kept, not demo data). The pre-change database remains in
`HL Website_backup_2026-11-11\data\headshotlab.db`.

---

## 6. Content problems noticed (not changed — founder owns copy)

1. Homepage claims "10k+ headshots delivered", "1,200+ clients", "5.0 average rating", a 300%
   LinkedIn lift, and named testimonials/portfolio people. The company facts mark these as
   unverified placeholders; the database has no real clients.
2. "New York • London • Remote" — London is unconfirmed.
3. Team dashboard in `track.html` hardcodes "Download All 18 Completed (ZIP)" regardless of the
   actual order size.
4. Contact form says the inquiry was "sent to our team", but it is only saved to SQLite; no email
   is sent.
5. Package labels in the order flow do not match the published price sheet exactly
   ("Executive Studio Headshot Pack" vs "Executive & Board Pack $89"; "Enterprise Team Headshots
   Pack" is used for the $19/person team tier).
6. Existing orders in the database have `invite_url` on `headshotlab.com`; new orders are generated
   on `headshotlab.us`. Confirm the canonical domain and fix old rows.
7. The portal's "New Order" button for individual clients is client-side only — it changes the view
   but is not saved, so it disappears after a reload.
8. "Use sample selfie" still says "for testing" in a production-facing portal.
9. Individual dashboard seed photos once pointed at `assets/casual_before.png`, which does not exist
   (the real file is `assets/before_casual.jpg`); the registration path is corrected, other sample
   references may remain.

---

## 7. Founder decisions needed

1. **Admin passcode**: a random `ADMIN_PASSCODE` was generated into `.env` when 8080 was restarted
   with approval. It is not in chat or in the HTML; view it in `HL Website\.env`. Decide who holds
   it and rotate it with the generator in `.env.example` before deploying.
2. **Demo rows**: purged on 11 Nov 2026 with approval (see section 5).
3. **Demo portal buttons**: removed because they displayed fabricated clients without auth. Keep
   them removed, or restore as a clearly labelled sandbox later?
4. **Order starting state**: new orders are still created at "Step 3 — In Production" with steps 1
   and 2 marked complete before any human review. Should new orders start at "Step 1 — Photos
   Received" until the retoucher accepts them?
5. **Canonical domain** (`.us` vs `.com`) for invite links and email.
6. **Content items in section 6**, especially the unverified metrics/testimonials and the contact
   form's "sent to our team" claim.
7. **Hostinger plan and Node 24** availability, plus the `HL_DB_PATH` location on the server.

---

## 8. Go-live checklist (short)

- [ ] Backup of project folder exists (done: `HL Website_backup_2026-11-11`)
- [ ] `ADMIN_PASSCODE` set (32+ random chars)
- [ ] Demo rows reviewed / purged
- [ ] `data/headshotlab.db` copied to persistent storage and backed up
- [ ] Node 24 selected; entry `serve.js`
- [ ] `COOKIE_SECURE=1`, TLS + force HTTPS
- [ ] Smoke test: `/`, `/portal`, `/admin`, `/api/admin/data` = 401, `/data/headshotlab.db` = 404
- [ ] 8080 local server restarted to load the fixed code (only after founder approval)
