// Edition hooks: Smart Chat allows everything (no plans). Kept so the core stays the same in other editions.
const E = {
  name: 'smartchat',
  // may this site use a feature? ('live' = talking to employees, 'reports', 'attachments')
  allows: (siteId, feature) => true,
  // how many dashboard users a site may have (null = no limit)
  userLimit: (siteId) => null,
  // is the chat button switched on for this site? (e.g. subscription ended)
  active: (siteId) => true
};
function use(over) { Object.assign(E, over); }
module.exports = new Proxy(E, { get: (t, k) => k === 'use' ? use : t[k] });
