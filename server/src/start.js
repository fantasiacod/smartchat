// Entry point: restores the database from cloud storage (if configured), then starts the server.
require('dotenv').config();
const path = require('path');
const persist = require('./persist');

(async () => {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  try {
    await persist.restore(dataDir);
  } catch (e) {
    console.error('[persist] restore failed:', e.message);
    if (persist.enabled()) { console.error('Check DATABASE_URL. Refusing to start with an empty database.'); process.exit(1); }
  }
  const { server } = require('./server');
  const { db } = require('./db');
  persist.start(db);
  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, () => console.log(`Smart Chat running on http://localhost:${PORT}  (dashboard: /admin/)`));
})();
