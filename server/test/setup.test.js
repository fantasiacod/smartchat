// First-run setup wizard + storage backends.
// Runs the real entry point (src/start.js) in a child process with an empty data folder.
//   SETUP_PG_URL / SETUP_MYSQL_URL — optional real databases to test with (skipped when not given)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✔ ' + m); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');
const PG = process.env.SETUP_PG_URL || '', MY = process.env.SETUP_MYSQL_URL || '';

function boot(dataDir, port, extraEnv = {}) {
  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port), SNAPSHOT_SECONDS: '5', ...extraEnv };
  for (const k of ['DB_TYPE', 'DATABASE_URL', 'FIREBASE_SERVICE_ACCOUNT', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME', 'SETUP', 'SETUP_CODE', 'RENDER']) if (!(k in extraEnv)) delete env[k];
  const p = spawn(process.execPath, ['src/start.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  KIDS.add(p); p.once('exit', () => KIDS.delete(p));
  p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; });
  return p;
}
async function until(fn, ms = 15000) { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } if (Date.now() - t > ms) throw new Error('timeout'); await wait(150); } }
async function req(port, method, p, body, headers = {}) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* html / redirect */ }
  return { s: r.status, j, loc: r.headers.get('location') };
}
const stop = async (p) => { p.kill('SIGTERM'); await new Promise(r => p.once('exit', r)); };
const FW = { 'x-forwarded-for': '203.0.113.9' }; // looks like a visitor from the internet (through the host's proxy)
const KIDS = new Set(); process.on('exit', () => { for (const k of KIDS) try { k.kill('SIGKILL'); } catch { /* gone */ } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scs-'));

(async () => {
  const persist = require('../src/persist');
  const setup = require('../src/setup');

  console.log('▶ helpers');
  ok(setup.buildUrl('mysql', { host: 'sql.host.com', database: 'db1', user: 'u', password: 'p@ss:/#' }) === 'mysql://u:p%40ss%3A%2F%23@sql.host.com:3306/db1', 'connection link built from separate boxes (password with special characters encoded)');
  ok(/^postgresql:\/\/.+:5432\//.test(setup.buildUrl('supabase', { host: 'h', database: 'postgres', user: 'u', password: 'x' })), 'PostgreSQL default port');
  const mc = persist.mssqlConfig('mssql://sa:My%40Pass@sql.example.com:1444/smart?encrypt=false');
  ok(mc.server === 'sql.example.com' && mc.port === 1444 && mc.user === 'sa' && mc.password === 'My@Pass' && mc.database === 'smart' && mc.options.encrypt === false, 'SQL Server link understood');
  assert.throws(() => setup.storageFrom({ type: 'supabase', url: 'postgresql://postgres:[YOUR-PASSWORD]@h:5432/postgres' }), /YOUR-PASSWORD/); pass++; console.log('  ✔ forgotten [YOUR-PASSWORD] placeholder explained');
  assert.throws(() => setup.storageFrom({ type: 'mongodb', url: 'http://x' }), /mongodb/); pass++; console.log('  ✔ wrong link format explained');
  assert.throws(() => setup.adminFrom({ admin_name: 'م', admin_email: 'a@b.co', admin_password: 'admin123' }, true), /سهلة/); pass++; console.log('  ✔ weak admin password refused');
  assert.throws(() => setup.adminFrom({ admin_name: 'م', admin_email: 'a@b.co', admin_password: 'Strong#Pass1', admin_password2: 'Other#Pass1' }, true), /متطابقتين/); pass++; console.log('  ✔ password confirmation checked');
  ok(setup.adminFrom({}, false) === null, 'admin can be left empty when the database already has accounts');
  ok(/لم يتم العثور/.test(setup.friendly(new Error('getaddrinfo ENOTFOUND x'))) && /كلمة مرور/.test(setup.friendly(new Error('password authentication failed for user'))), 'connection errors explained in plain Arabic');

  console.log('▶ MongoDB store (split into parts, never half-written)');
  const fakeCol = () => { const m = new Map(); return { m,
    findOne: async (q) => m.get(q._id) || null,
    find: (q) => ({ toArray: async () => [...m.values()].filter(d => d.gen === q.gen) }),
    replaceOne: async (q, d) => { m.set(q._id, { _id: q._id, ...d }); },
    deleteMany: async (q) => { for (const [k, d] of m) if (k !== q._id.$ne && d.gen !== q.gen.$ne) m.delete(k); } }; };
  const col = fakeCol(), ms = persist.mongoStore(col);
  ok((await ms.load()) === null, 'empty MongoDB → fresh start');
  const big = require('crypto').randomBytes(9 * 1024 * 1024); // doesn't compress: needs 2 parts of 8 MB
  await ms.store(big); const back = await ms.load();
  ok(Buffer.compare(back.data, big) === 0 && [...col.m.keys()].length === 3, 'MongoDB: 9 MB copy stored in 2 parts and read back identical');
  await ms.store(Buffer.from('second'));
  ok((await ms.load()).data.toString() === 'second' && col.m.size === 2, 'MongoDB: old parts removed after the new copy is complete');

  console.log('▶ Firebase (Cloud Firestore REST — local stand-in)');
  const docs = new Map(); let commits = 0;
  const emu = http.createServer((q, r) => {
    let b = ''; q.on('data', c => { b += c; }); q.on('end', () => {
      const send = (s, j) => { r.writeHead(s, { 'content-type': 'application/json' }); r.end(JSON.stringify(j)); };
      const u = decodeURIComponent(q.url.replace(/^\/v1\//, ''));
      if (q.method === 'GET') { const d = docs.get(u); return d ? send(200, { name: u, fields: d }) : send(404, { error: { message: 'not found' } }); }
      if (q.method === 'POST' && u.endsWith(':commit')) {
        commits++;
        for (const w of JSON.parse(b).writes) { if (w.update) { assert.ok(JSON.stringify(w.update.fields).length < 1048576, 'document over 1 MiB'); docs.set(w.update.name, w.update.fields); } if (w.delete) docs.delete(w.delete); }
        return send(200, { writeResults: [] });
      }
      send(400, { error: { message: 'bad' } });
    });
  }).listen(0);
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + emu.address().port;
  const sa = { type: 'service_account', project_id: 'demo-sc', client_email: 'x@demo-sc.iam.gserviceaccount.com', private_key: 'unused-with-emulator' };
  const fc = persist.firestoreClient(sa);
  ok((await fc.load()) === null, 'empty Firestore → fresh start');
  const fbig = require('crypto').randomBytes(2 * 1024 * 1024);
  await fc.store(fbig);
  ok(Buffer.compare((await fc.load()).data, fbig) === 0 && [...docs.keys()].filter(k => /_\d+$/.test(k)).length === 3, 'Firebase: 2 MB copy stored in 3 documents (each under the 1 MiB limit) and read back identical');
  await fc.store(Buffer.from('v2'));
  ok((await fc.load()).data.toString() === 'v2' && docs.size === 2, 'Firebase: previous parts cleaned up');
  ok(persist.parseServiceAccount(Buffer.from(JSON.stringify(sa)).toString('base64')).project_id === 'demo-sc', 'service account accepted as JSON or base64 (for environment variables)');
  assert.throws(() => persist.parseServiceAccount('{"a":1}'), /ناقص/); pass++; console.log('  ✔ incomplete service account file explained');

  console.log('▶ first run: wizard from the internet (setup code required)');
  const D1 = tmp(), P1 = 3901;
  let p = boot(D1, P1, { RENDER: 'true' });
  await until(() => /Setup code:\s+(\d{4}-\d{4})/.test(p.out));
  const code = /Setup code:\s+(\d{4}-\d{4})/.exec(p.out)[1];
  ok(true, 'setup code printed in the log: ' + code);
  ok((await req(P1, 'GET', '/admin/')).loc === '/setup', 'dashboard address leads to the setup page');
  ok((await req(P1, 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'admin123' })).s === 503, 'no default admin123 account on a new install');
  const info = (await req(P1, 'GET', '/api/setup/info', undefined, FW)).j;
  ok(info.need_code && info.need_storage && info.need_admin && info.ephemeral, 'wizard asks for: code, database, admin (and knows this host wipes its disk)');
  ok((await req(P1, 'POST', '/api/setup/code', { code: '0000-0000' }, FW)).s === 403, 'wrong setup code refused');
  ok((await req(P1, 'POST', '/api/setup/test', { code: '0000-0000', type: 'mysql', url: 'mysql://a:b@10.0.0.1/x' }, FW)).s === 403, 'connection test needs the code too (nobody can use the wizard to probe other servers)');
  ok((await req(P1, 'POST', '/api/setup/code', { code }, FW)).s === 200, 'correct setup code accepted');
  const bad = await req(P1, 'POST', '/api/setup/test', { code, type: 'mysql', host: 'no-such-host.invalid', database: 'x', user: 'u', password: 'p' }, FW);
  ok(bad.s === 400 && /لم يتم العثور/.test(bad.j.error), 'unreachable database → clear message (' + bad.j.error + ')');
  if (PG) {
    const t = await req(P1, 'POST', '/api/setup/test', { code, type: 'supabase', url: PG }, FW);
    ok(t.s === 200 && t.j.existing === null, 'PostgreSQL / Supabase: connection test passes, new database');
    const fin = await req(P1, 'POST', '/api/setup/finish', { code, type: 'supabase', url: PG, admin_name: 'عبدالله', admin_email: 'Boss@Charity.sa', admin_password: 'Strong#Pass2026', admin_password2: 'Strong#Pass2026' }, FW);
    ok(fin.s === 200 && fin.j.env.some(e => e[0] === 'DATABASE_URL' && e[1] === PG) && fin.j.env.some(e => e[0] === 'DB_TYPE' && e[1] === 'supabase'), 'finished — environment variables to copy are returned');
    await until(async () => (await req(P1, 'GET', '/healthz')).j?.setup === undefined);
    const lg = await req(P1, 'POST', '/api/auth/login', { email: 'boss@charity.sa', password: 'Strong#Pass2026' });
    const me = (await req(P1, 'GET', '/api/me', undefined, { authorization: 'Bearer ' + lg.j.token })).j;
    const meU = me.user || me;
    ok(lg.s === 200 && meU.name === 'عبدالله' && meU.role === 'admin' && meU.email === 'boss@charity.sa', 'dashboard opens right after; the chosen admin logs in');
    ok((await req(P1, 'GET', '/setup')).loc === '/admin/', 'setup page closed after it is completed');
    const sf = path.join(D1, 'storage.json');
    ok(fs.existsSync(sf) && (fs.statSync(sf).mode & 0o077) === 0, 'choice saved for next start (file readable by the owner only)');
    await wait(1500); await stop(p);

    console.log('▶ restart: no wizard, data comes back from the database');
    fs.rmSync(path.join(D1, 'chat.db')); fs.rmSync(path.join(D1, 'chat.db-wal'), { force: true }); fs.rmSync(path.join(D1, 'chat.db-shm'), { force: true });
    p = boot(D1, P1);
    await until(async () => (await req(P1, 'GET', '/healthz')).j?.ok);
    ok(!/Setup code/.test(p.out) && /restored database/.test(p.out), 'restarted without the wizard, database restored from PostgreSQL');
    ok((await req(P1, 'POST', '/api/auth/login', { email: 'boss@charity.sa', password: 'Strong#Pass2026' })).s === 200, 'admin account still there after restart');
    await stop(p);

    console.log('▶ host wiped its disk, environment variables set (Render free)');
    const D2 = tmp();
    p = boot(D2, P1, { DB_TYPE: 'supabase', DATABASE_URL: PG });
    await until(async () => (await req(P1, 'GET', '/healthz')).j?.ok);
    ok(!/Setup code/.test(p.out) && (await req(P1, 'POST', '/api/auth/login', { email: 'boss@charity.sa', password: 'Strong#Pass2026' })).s === 200, 'fresh disk + environment variables → straight to the dashboard with all data');
    await stop(p);

    console.log('▶ new host pointed at a database that already has a bot');
    const D3 = tmp();
    p = boot(D3, P1);
    await until(() => /Setup code:\s+(\d{4}-\d{4})/.test(p.out));
    const t2 = await req(P1, 'POST', '/api/setup/test', { type: 'supabase', url: PG }); // from this computer: no code
    ok(t2.s === 200 && t2.j.existing && t2.j.existing.size > 0, 'existing bot data found and reported before continuing (opened from the same computer: no code needed)');
    ok((await req(P1, 'POST', '/api/setup/finish', { type: 'supabase', url: PG })).s === 200, 'admin may be left empty when accounts already exist');
    await until(async () => (await req(P1, 'GET', '/healthz')).j?.setup === undefined);
    ok((await req(P1, 'POST', '/api/auth/login', { email: 'boss@charity.sa', password: 'Strong#Pass2026' })).s === 200, 'old accounts work on the new host');
    await stop(p);
  } else { console.log('  (PostgreSQL tests skipped — set SETUP_PG_URL)'); await stop(p); }

  if (MY) {
    console.log('▶ MySQL chosen in the wizard');
    const D4 = tmp(), P4 = 3902;
    p = boot(D4, P4);
    await until(() => /Setup code/.test(p.out));
    const u = new URL(MY);
    const f = { type: 'mysql', host: u.hostname, port: u.port, database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    ok((await req(P4, 'POST', '/api/setup/test', f)).s === 200, 'MySQL: connection test passes (from separate boxes)');
    const wrongPw = await req(P4, 'POST', '/api/setup/test', { ...f, password: 'wrong' });
    ok(wrongPw.s === 400 && /كلمة مرور/.test(wrongPw.j.error), 'MySQL: wrong password explained');
    ok((await req(P4, 'POST', '/api/setup/finish', { ...f, admin_name: 'سارة', admin_email: 'sara@cafe.sa', admin_password: 'Cafe#2026pass', admin_password2: 'Cafe#2026pass' })).s === 200, 'MySQL: setup finished');
    await until(async () => (await req(P4, 'GET', '/healthz')).j?.setup === undefined);
    ok((await req(P4, 'POST', '/api/auth/login', { email: 'sara@cafe.sa', password: 'Cafe#2026pass' })).s === 200, 'MySQL: admin logs in');
    await wait(1200); await stop(p);
    const mysql = require('mysql2/promise'); const c = await mysql.createConnection(MY);
    const [[row]] = await c.query('SELECT LENGTH(data) n FROM smartchat_snapshot WHERE id=1'); await c.end();
    ok(row && row.n > 10000, 'MySQL: bot data saved in the database (' + row.n + ' bytes)');
  } else console.log('  (MySQL tests skipped — set SETUP_MYSQL_URL)');

  console.log('▶ SQLite on this computer');
  const D5 = tmp(), P5 = 3903;
  p = boot(D5, P5);
  await until(() => /Setup code/.test(p.out));
  const li = (await req(P5, 'GET', '/api/setup/info')).j;
  ok(li.need_code === false && li.ephemeral === false, 'opened on the same computer: no code needed');
  ok((await req(P5, 'POST', '/api/setup/finish', { type: 'sqlite', admin_name: 'Ali', admin_email: 'ali@shop.sa', admin_password: 'Shop#2026pass' })).s === 200, 'SQLite chosen');
  await until(async () => (await req(P5, 'GET', '/healthz')).j?.setup === undefined);
  ok((await req(P5, 'POST', '/api/auth/login', { email: 'ali@shop.sa', password: 'Shop#2026pass' })).s === 200, 'SQLite: admin logs in');
  await stop(p);
  p = boot(D5, P5); await until(async () => (await req(P5, 'GET', '/healthz')).j?.ok);
  ok(!/Setup code/.test(p.out), 'SQLite: no wizard on the next start');
  await stop(p);

  console.log('▶ older installs are not affected');
  const D6 = tmp();
  p = boot(D6, 3904, { ADMIN_EMAIL: 'old@x.sa', ADMIN_PASSWORD: 'Old#Pass2026' });
  await until(async () => (await req(3904, 'GET', '/healthz')).j?.ok);
  ok(!/Setup code/.test(p.out) && (await req(3904, 'POST', '/api/auth/login', { email: 'old@x.sa', password: 'Old#Pass2026' })).s === 200, 'admin from environment variables → no wizard (as before)');
  await stop(p);
  p = boot(tmp(), 3905, { SETUP: 'off' }); await until(async () => (await req(3905, 'GET', '/healthz')).j?.ok);
  ok(!/Setup code/.test(p.out), 'SETUP=off skips the wizard');
  await stop(p);

  emu.close();
  console.log(`\n${pass} setup checks passed ✅`);
  process.exit(0);
})().catch(e => { console.error('❌', e); process.exit(1); });
