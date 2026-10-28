// Users that belong to one site (a branch, a department…) only ever reach that site's data.
// Every dashboard route a site user may call is listed here with how its data is tied to the site.
// Anything not listed is refused (fail closed), so a new route can never leak another site's data by mistake.
const { db } = require('./db');

// how each route is checked
//   any          – no site data (own profile, lists of templates…)
//   query        – ?site= is forced to the user's site
//   body         – body.site_id / body.site is forced to the user's site
//   param        – /api/sites/:id must be the user's site
//   own:<table>  – the row :id must belong to the user's site
//   deny         – platform-only (backups, reset, database connectors, other sites…)
const RULES = {
  'GET /api/me': 'any', 'PUT /api/me': 'any',
  'GET /api/users': 'any', 'POST /api/users': 'any', 'PUT /api/users/:id': 'own:users', 'DELETE /api/users/:id': 'own:users',
  'GET /api/sites': 'any', 'POST /api/sites': 'deny', 'PUT /api/sites/:id': 'param', 'DELETE /api/sites/:id': 'deny',
  'POST /api/sites/:id/regenerate-secret': 'deny',
  'GET /api/tree-template': 'any', 'GET /api/business-types': 'any', 'GET /api/tree-templates': 'any', 'GET /api/i18n': 'any',
  'GET /api/sites/:id/widget-config': 'param', 'POST /api/sites/:id/widget-config/preview': 'param', 'GET /api/sites/:id/install-status': 'param',
  'GET /api/sites/:id/wordpress-plugin.zip': 'deny',
  'POST /api/datasource/file': 'deny', 'GET /api/datasource/file-info': 'deny', 'POST /api/sites/:id/datasource/test': 'deny',
  'POST /api/sites/:id/wp-bridge': 'deny', 'POST /api/sites/:id/datasource/schema': 'deny',
  'POST /api/sites/:id/notify/test': 'deny', 'GET /api/notify-log': 'deny',
  'POST /api/media': 'any',
  'GET /api/conversations': 'query', 'GET /api/conversations/:id': 'own:conversations', 'GET /api/conversations/:id/export': 'own:conversations', 'DELETE /api/conversations/:id': 'own:conversations',
  'GET /api/kb': 'query', 'POST /api/kb': 'body', 'PUT /api/kb/:id': 'own:kb', 'DELETE /api/kb/:id': 'own:kb', 'POST /api/kb/test': 'body',
  'GET /api/unanswered': 'query', 'PUT /api/unanswered/:id': 'own:unanswered',
  'GET /api/tickets': 'query', 'GET /api/tickets/stats': 'query', 'GET /api/tickets/export': 'query', 'GET /api/tickets/:id': 'own:tickets',
  'POST /api/tickets': 'body', 'PUT /api/tickets/:id': 'own:tickets', 'DELETE /api/tickets/:id': 'own:tickets',
  'GET /api/appointments': 'query', 'POST /api/appointments': 'body', 'PUT /api/appointments/:id': 'own:appointments', 'DELETE /api/appointments/:id': 'own:appointments',
  'POST /api/eligibility/test': 'any', 'GET /api/eligibility/results': 'query',
  'GET /api/mindmap': 'query', 'PUT /api/mindmap/layout': 'body',
  'POST /api/kb-categories': 'body', 'PUT /api/kb-categories/:id': 'own:kb_categories', 'DELETE /api/kb-categories/:id': 'own:kb_categories',
  'GET /api/backup/download': 'deny', 'GET /api/backups': 'deny', 'PUT /api/backups/config': 'deny', 'POST /api/backups': 'deny',
  'GET /api/backups/:name': 'deny', 'DELETE /api/backups/:name': 'deny', 'POST /api/backups/:name/restore': 'deny', 'POST /api/backup/restore': 'deny',
  'POST /api/reset': 'deny', 'GET /api/audit': 'deny',
  'GET /api/stats': 'query', 'GET /api/reports/agents': 'query', 'GET /api/reports/agents.xlsx': 'query', 'GET /api/online': 'any', 'GET /api/edition': 'any', 'GET /api/regs': 'query', 'GET /api/regs/export': 'query', 'DELETE /api/regs/:id': 'own:program_regs'
};
const OWN_TABLES = ['program_regs', 'users', 'conversations', 'kb', 'unanswered', 'tickets', 'appointments', 'kb_categories'];

// settings a site user may change (the rest belong to whoever runs the platform)
const SITE_SECTIONS = ['regs', 'biz', 'ui', 'appointments', 'eligibility', 'appearance', 'texts', 'prechat', 'behavior', 'org', 'tickets', 'languages'];

const extra = {}; // routes added by editions: 'METHOD /path' → rule
function allow(key, rule) { extra[key] = rule; }

/** @returns {null | {status, error}} — null means the request may go on */
function gate(req, user) {
  const sid = Number(user.site_id);
  const key = req.method + ' ' + (req.baseUrl || '') + (req.route ? req.route.path : req.path);
  const rule = extra[key] || RULES[key];
  if (!rule || rule === 'deny') return { status: 403, error: 'ليس لديك صلاحية' };
  req.tenant = sid;
  if (rule === 'any') return null;
  if (rule === 'query') { req.query.site = String(sid); req.query._tenant = String(sid); return null; }
  if (rule === 'body') {
    req.body = req.body && typeof req.body === 'object' ? req.body : {};
    if ('site' in req.body || key === 'PUT /api/mindmap/layout') req.body.site = sid;
    req.body.site_id = sid;
    return null;
  }
  if (rule === 'param') return Number(req.params.id) === sid ? null : { status: 404, error: 'not found' };
  if (rule.startsWith('own:')) {
    const table = rule.slice(4);
    if (!OWN_TABLES.includes(table)) return { status: 403, error: 'ليس لديك صلاحية' };
    const row = db.prepare(`SELECT site_id FROM ${table} WHERE id=?`).get(Number(req.params.id));
    return row && Number(row.site_id) === sid ? null : { status: 404, error: 'not found' };
  }
  return { status: 403, error: 'ليس لديك صلاحية' };
}

// may this user act on a conversation / site? (used by the live chat socket)
const canSee = (user, siteId) => user.site_id == null || Number(user.site_id) === Number(siteId);

const ruleOf = (key) => extra[key] || RULES[key] || null;
module.exports = { gate, allow, canSee, ruleOf, RULES, SITE_SECTIONS };
