// Load test: how many conversations per minute the server handles.
//   node test/load.js <server-url> <site-key> <conversations-per-minute> [seconds=60]
// Each simulated visitor: connects, starts a chat, picks a menu number, asks a question, asks for the location, leaves.
const { io } = require('socket.io-client');
const [URL = 'http://localhost:3000', KEY, RATE = '300', SECS = '60'] = process.argv.slice(2);
if (!KEY) { console.log('usage: node test/load.js <url> <site-key> <conversations-per-minute> [seconds]'); process.exit(1); }
const total = Math.round(Number(RATE) * Number(SECS) / 60), gap = 60000 / Number(RATE);
const lat = [], errors = []; let done = 0, started = 0, msgs = 0;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function visitor(i) {
  return new Promise((resolve) => {
    const s = io(URL + '/visitor', { transports: ['websocket'], reconnection: false, timeout: 15000 });
    let pending = null;
    const fail = (e) => { errors.push(String(e)); s.close(); resolve(); };
    const ask = (text) => new Promise((res, rej) => {
      const t0 = Date.now();
      pending = () => { lat.push(Date.now() - t0); msgs++; res(); };
      setTimeout(() => { if (pending) { pending = null; rej(new Error('timeout: ' + text)); } }, 15000);
      s.emit('message', { text });
    });
    s.on('message', (m) => { if (m.sender === 'bot' && pending) { const p = pending; pending = null; p(); } });
    s.on('connect_error', fail);
    s.on('connect', async () => {
      try {
        await new Promise((r, j) => s.emit('join', { site: KEY, visitorId: 'load-' + i + '-' + Date.now() }, (x) => x?.error ? j(x.error) : r()));
        await new Promise(r => s.emit('start', { name: 'زائر ' + i }, r));
        await wait(200);
        await ask(String(1 + (i % 5)));
        await ask('كيف أسجّل في الجمعية؟');
        await ask('وين موقعكم؟');
        s.emit('close', {}); done++;
      } catch (e) { errors.push(e.message); }
      s.close(); resolve();
    });
  });
}

(async () => {
  console.log(`▶ ${total} conversations over ${SECS}s (${RATE}/min) against ${URL}`);
  const t0 = Date.now(), all = [];
  for (let i = 0; i < total; i++) { all.push(visitor(i)); started++; await wait(gap); }
  await Promise.all(all);
  const secs = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const p = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] : null;
  console.log(JSON.stringify({ conversations_ok: done, conversations_started: started, errors: errors.length, bot_replies: msgs, seconds: Math.round(secs),
    conversations_per_minute: Math.round(done / secs * 60), reply_ms: { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: lat[lat.length - 1] }, sample_errors: [...new Set(errors)].slice(0, 3) }, null, 1));
  process.exit(0);
})();
