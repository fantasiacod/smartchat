// Outgoing webhooks: lets other systems (CRM, ERP, Zapier/Make/n8n…) react to events. Signed with HMAC-SHA256.
//   header X-SmartChat-Event: <event>, X-SmartChat-Signature: sha256=<hmac(body, secret)>
const crypto = require('crypto');
const EVENTS = ['conversation.started', 'conversation.handoff', 'conversation.closed', 'conversation.rated', 'ticket.created', 'ticket.updated', 'kb.learned'];

function emit(site, event, data) {
  const hooks = (site?.settings?.integrations?.webhooks || []).filter(h => h.enabled !== false && h.url && (!h.events?.length || h.events.includes(event)));
  for (const h of hooks) {
    const body = JSON.stringify({ event, site: { id: site.id, name: site.name }, at: new Date().toISOString(), data });
    const sig = crypto.createHmac('sha256', String(h.secret || '')).update(body).digest('hex');
    fetch(h.url, { method: 'POST', body, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', 'x-smartchat-event': event, 'x-smartchat-signature': 'sha256=' + sig } })
      .catch(e => console.error('[webhook]', h.url, e.message));
  }
}
module.exports = { emit, EVENTS };
