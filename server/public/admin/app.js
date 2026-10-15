/* Smart Chat — admin dashboard (vanilla JS SPA) */
(function () {
  'use strict';
  const S = {
    token: localStorage.getItem('sc_token'), user: null, sites: [], siteId: Number(localStorage.getItem('sc_site')) || null,
    socket: null, live: new Map(), selected: null, tab: 'waiting', online: [], users: [], typing: {}
  };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLES = { admin: 'مدير', supervisor: 'مشرف', agent: 'موظف' };
  const LEVEL = { agent: 1, supervisor: 2, admin: 3 };
  const can = (r) => S.user && LEVEL[S.user.role] >= LEVEL[r];
  const STATUS = { bot: 'مع البوت', waiting: 'بانتظار موظف', human: 'مع موظف', closed: 'مغلقة' };
  const CLOSED_BY = { visitor: 'المستفيد', agent: 'الموظف', system: 'النظام (عدم نشاط)' };
  const SENDER = { visitor: 'المستفيد', bot: 'البوت', agent: 'موظف', system: 'النظام' };
  const ACTIONS = { goto: 'الانتقال إلى عقدة', answer: 'رد نصي مباشر', order_status: 'استعلام حالة طلب (قاعدة البيانات)', customer_info: 'عرض بيانات المستفيد', handoff: 'تحويل لموظف بشري', url: 'فتح رابط', end: 'إنهاء المحادثة' };
  const site = () => S.sites.find(s => s.id === S.siteId) || S.sites[0];
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'الآن'; if (s < 3600) return `قبل ${Math.floor(s / 60)} د`; if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
    return fmtDate(iso);
  };

  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.token }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { logout(); throw new Error('unauthorized'); }
    const j = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error(j.error || 'خطأ');
    return j;
  }

  function toast(msg, type = '', onclick) {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.innerHTML = msg;
    t.onclick = () => { onclick?.(); t.remove(); };
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
  const ok = (m) => toast(esc(m), 'ok');
  const err = (e) => toast(esc(e.message || e), 'err');

  function beep() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .4); o.start(); o.stop(a.currentTime + .4);
    } catch { /* ignore */ }
  }
  function notifyBrowser(title, body) {
    if (document.hasFocus() || !('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body });
  }

  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
  function ratingColor(v, max) { const h = max <= .5 ? 120 : Math.round(((v - .5) / (max - .5)) * 120); return `hsl(${h},78%,${h > 60 ? 40 : 50}%)`; }
  function stars(v, max = 5) {
    if (v == null) return '<span class="muted">—</span>';
    const c = ratingColor(v, max); let h = '<span class="stars" title="' + v + ' / ' + max + '">';
    for (let i = 0; i < max; i++) {
      const f = Math.max(0, Math.min(1, v - i));
      h += `<i><span style="position:absolute;inset:0">${STAR.replace('<path', '<path fill="#e5e7eb"')}</span><span style="position:absolute;inset:0;clip-path:inset(0 ${100 - f * 100}% 0 0)">${STAR.replace('<path', `<path fill="${c}"`)}</span></i>`;
    }
    return h + `</span> <b style="color:${c};font-size:13px">${v}</b>`;
  }

  function modal(html, onMount) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
    document.body.appendChild(bg);
    $$('[data-close]', bg).forEach(b => b.onclick = () => bg.remove());
    onMount?.(bg, () => bg.remove());
    return bg;
  }

  /* ============================ auth ============================ */
  function logout() {
    localStorage.removeItem('sc_token'); S.token = null; S.user = null;
    S.socket?.disconnect(); renderLogin();
  }

  function renderLogin() {
    $('#app').innerHTML = `
    <div class="login"><form class="card" id="lf">
      <div class="logo"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg></div>
      <h1>تسجيل الدخول</h1><p class="muted" style="margin:0 0 20px">لوحة تحكم المساعد الذكي وخدمة العملاء</p>
      <label class="f"><span>البريد الإلكتروني</span><input type="email" name="email" required autofocus></label>
      <label class="f"><span>كلمة المرور</span><input type="password" name="password" required></label>
      <button class="btn pri" style="width:100%;justify-content:center;padding:11px">دخول</button>
      <p class="err" style="color:var(--danger);min-height:20px;margin:10px 0 0"></p>
    </form></div>`;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.email.value, password: f.password.value }) });
      const j = await r.json();
      if (!r.ok) return ($('.err', f).textContent = j.error);
      S.token = j.token; localStorage.setItem('sc_token', j.token); boot();
    };
  }

  async function boot() {
    if (!S.token) return renderLogin();
    try {
      S.user = await api('GET', '/api/me');
      S.sites = await api('GET', '/api/sites');
      S.users = await api('GET', '/api/users');
    } catch { return; }
    if (!S.sites.find(s => s.id === S.siteId)) S.siteId = S.sites[0]?.id;
    renderShell();
    connectSocket();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    route();
  }

  /* ============================ shell ============================ */
  const NAV = [
    ['inbox', '💬', 'المحادثات الحية', 'agent'],
    ['history', '🗂️', 'سجل المحادثات', 'agent'],
    ['stats', '📊', 'الإحصائيات', 'agent'],
    ['sec', 'المساعد الذكي'],
    ['tree', '🌳', 'شجرة الردود', 'supervisor'],
    ['kb', '📚', 'قاعدة المعرفة', 'agent'],
    ['behavior', '🤖', 'سلوك البوت', 'supervisor'],
    ['datasource', '🗄️', 'ربط قاعدة البيانات', 'admin'],
    ['sec', 'التخصيص والتركيب'],
    ['appearance', '🎨', 'المظهر والنصوص', 'supervisor'],
    ['install', '🔌', 'التركيب على المواقع', 'supervisor'],
    ['sec', 'الإدارة'],
    ['users', '👥', 'المستخدمون والصلاحيات', 'admin'],
    ['sites', '🌐', 'المواقع', 'admin'],
    ['audit', '🛡️', 'سجل العمليات', 'admin'],
    ['profile', '⚙️', 'حسابي', 'agent']
  ];

  function renderShell() {
    $('#app').innerHTML = `
    <div class="app">
      <nav class="side" id="side">
        <div class="brand"><div class="logo"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg></div>المساعد الذكي</div>
        ${NAV.map(n => n[0] === 'sec' ? `<div class="sec">${n[1]}</div>` : can(n[3]) ? `<a href="#/${n[0]}" data-p="${n[0]}"><span>${n[1]}</span>${n[2]}${n[0] === 'inbox' ? '<span class="cnt hidden" id="wcnt">0</span>' : ''}</a>` : '').join('')}
        <div class="me"><b>${esc(S.user.name)}</b><span class="muted">${ROLES[S.user.role]}</span> · <a href="#" id="lo" style="color:#fca5a5">خروج</a>
        <div id="onl" style="margin-top:8px;font-size:12px;color:#7fa08d"></div></div>
      </nav>
      <div class="main">
        <div class="top"><button class="btn sm menu-btn" id="mb">☰</button><h2 id="ttl"></h2>
          <select id="sitesel" style="width:auto;min-width:160px">${S.sites.map(s => `<option value="${s.id}" ${s.id === S.siteId ? 'selected' : ''}>🌐 ${esc(s.name)}</option>`).join('')}</select>
        </div>
        ${S.user.weak_password ? '<div style="background:#fef2f2;color:#991b1b;padding:10px 20px;border-bottom:1px solid #fecaca;font-size:14px">⚠️ أنت تستخدم كلمة المرور الافتراضية. <a href="#/profile" style="color:#991b1b;font-weight:700">غيّرها الآن</a> لحماية لوحة التحكم.</div>' : ''}
        <div class="content" id="ct"></div>
      </div>
    </div>`;
    $('#lo').onclick = (e) => { e.preventDefault(); logout(); };
    $('#mb').onclick = () => $('#side').classList.toggle('open');
    $('#sitesel').onchange = (e) => { S.siteId = Number(e.target.value); localStorage.setItem('sc_site', S.siteId); route(); };
  }

  function setTitle(t, flush) {
    $('#ttl').textContent = t;
    $('#ct').className = 'content' + (flush ? ' flush' : '');
    $('#side').classList.remove('open');
  }

  function updateWaitingCount() {
    const n = [...S.live.values()].filter(c => c.status === 'waiting').length;
    const el = $('#wcnt'); if (!el) return;
    el.textContent = n; el.classList.toggle('hidden', !n);
    document.title = (n ? `(${n}) ` : '') + 'لوحة تحكم المحادثات';
  }

  /* ============================ socket ============================ */
  function connectSocket() {
    S.socket?.disconnect();
    S.socket = io('/agent', { auth: { token: S.token } });
    S.socket.on('connect_error', () => { });
    S.socket.on('agents:online', (list) => {
      S.online = list;
      const el = $('#onl'); if (el) el.textContent = '🟢 متصلون: ' + list.map(u => u.name).join('، ');
    });
    S.socket.on('conv:update', (c) => {
      if (c.status === 'closed') S.live.delete(c.id); else S.live.set(c.id, c);
      updateWaitingCount();
      if (page() === 'inbox') { renderInboxList(); if (S.selected === c.id) renderChatHeader(c); }
    });
    S.socket.on('conv:message', (m) => {
      if (page() === 'inbox' && S.selected === m.conversation_id && S.detail) {
        S.detail.messages.push(m); appendMsg(m);
      }
    });
    S.socket.on('visitor:typing', (t) => {
      if (page() === 'inbox' && S.selected === t.conversation_id) {
        const el = $('#typing'); if (el) el.textContent = t.typing ? 'المستفيد يكتب الآن...' : '';
      }
    });
    S.socket.on('notify', (n) => {
      const c = n.conversation, name = esc(c.visitor_name || 'زائر #' + c.id);
      const open = () => { location.hash = '#/inbox'; setTimeout(() => selectConv(c.id), 50); };
      if (n.type === 'waiting') { beep(); toast(`🙋 ${name} يطلب التحدث مع موظف${c.pending_question ? '<br><small>' + esc(c.pending_question) + '</small>' : ''}`, '', open); notifyBrowser('طلب تحويل لموظف', c.pending_question || c.visitor_name || ''); }
      if (n.type === 'closed' && n.by === 'visitor') toast(`🚪 أغلق ${name} المحادثة #${c.id}`, '', () => location.hash = '#/conv/' + c.id);
      if (n.type === 'rated') toast(`⭐ قيّم ${name} المحادثة: ${stars(c.rating, c.rating_max)}`, '', () => location.hash = '#/conv/' + c.id);
      if (n.type === 'transfer' && n.to === S.user.id) { beep(); toast(`↪️ تم تحويل محادثة ${name} إليك`, '', open); }
      if (n.type === 'closed' && page() === 'history') renderHistory();
    });
    S.socket.on('kb:learned', (k) => toast(`📚 تم حفظ إجابة جديدة في قاعدة المعرفة: ${esc(k.question)}`, 'ok'));
    api('GET', '/api/conversations?status=active&limit=200').then(r => { S.live.clear(); r.items.forEach(c => S.live.set(c.id, c)); updateWaitingCount(); if (page() === 'inbox') renderInboxList(); });
  }

  /* ============================ router ============================ */
  const page = () => (location.hash.replace(/^#\//, '').split('/')[0] || 'inbox');
  function route() {
    if (!S.user) return;
    const [p, arg] = location.hash.replace(/^#\//, '').split('/');
    $$('.side a[data-p]').forEach(a => a.classList.toggle('on', a.dataset.p === (p || 'inbox') || (p === 'conv' && a.dataset.p === 'history')));
    const pages = { inbox: renderInbox, history: renderHistory, conv: () => renderConvPage(Number(arg)), stats: renderStats, tree: renderTree, kb: renderKB, behavior: renderBehavior, datasource: renderDatasource, appearance: renderAppearance, install: renderInstall, users: renderUsers, sites: renderSites, audit: renderAudit, profile: renderProfile };
    (pages[p || 'inbox'] || renderInbox)();
  }
  window.addEventListener('hashchange', route);

  async function saveSite(patch, msg = 'تم الحفظ') {
    try {
      const s = await api('PUT', '/api/sites/' + site().id, patch);
      const i = S.sites.findIndex(x => x.id === s.id); S.sites[i] = s; ok(msg); return s;
    } catch (e) { err(e); throw e; }
  }

  /* ============================ inbox ============================ */
  function renderInbox() {
    setTitle('المحادثات الحية', true);
    $('#ct').innerHTML = `
    <div class="inbox">
      <div class="list" id="ilist">
        <div class="tabs" id="itabs"></div>
        <div class="items" id="items"></div>
      </div>
      <div class="chat" id="ichat"><div class="empty" style="margin:auto">اختر محادثة من القائمة 👈</div></div>
      <div class="info" id="iinfo"></div>
    </div>`;
    renderInboxList();
    if (S.selected && S.live.has(S.selected)) selectConv(S.selected);
  }

  function renderInboxList() {
    const items = [...S.live.values()];
    const tabs = [['waiting', 'بانتظار موظف'], ['mine', 'محادثاتي'], ['human', 'مع موظفين'], ['bot', 'مع البوت']];
    const filt = (t) => items.filter(c => t === 'mine' ? (c.status === 'human' && c.assigned_to === S.user.id) : c.status === t);
    const tb = $('#itabs'); if (!tb) return;
    tb.innerHTML = tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-t="${k}">${l}<span class="n">${filt(k).length}</span></button>`).join('');
    $$('button', tb).forEach(b => b.onclick = () => { S.tab = b.dataset.t; renderInboxList(); });
    const list = filt(S.tab).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    $('#items').innerHTML = list.length ? list.map(c => `
      <div class="ci ${S.selected === c.id ? 'on' : ''}" data-id="${c.id}">
        <div class="l1"><b>${esc(c.visitor_name || 'زائر #' + c.id)}</b>${c.verified ? '<span title="هوية موثقة">✅</span>' : ''}<span class="tag ${c.status}">${STATUS[c.status]}</span></div>
        <div class="l2">${c.pending_question ? '❓ ' + esc(c.pending_question) : c.last_message ? `${SENDER[c.last_message.sender]}: ${esc(c.last_message.body)}` : ''}</div>
        <div class="t">${ago(c.updated_at)} · ${esc(c.site_name || '')}${c.agent_name ? ' · 👤 ' + esc(c.agent_name) : ''}</div>
      </div>`).join('') : '<div class="empty">لا توجد محادثات هنا</div>';
    $$('.ci', $('#items')).forEach(el => el.onclick = () => selectConv(Number(el.dataset.id)));
  }

  async function selectConv(id) {
    S.selected = id;
    if (page() !== 'inbox') return;
    $$('.ci').forEach(e => e.classList.toggle('on', Number(e.dataset.id) === id));
    try { S.detail = await api('GET', '/api/conversations/' + id); } catch (e) { return err(e); }
    const d = S.detail;
    $('#ichat').innerHTML = `
      <div class="ch" id="chh"></div>
      <div class="msgs" id="msgs"></div>
      <div class="typing-ind" id="typing"></div>
      <div class="composer" id="comp"></div>`;
    renderChatHeader(d);
    $('#msgs').innerHTML = d.messages.map(msgHTML).join('');
    bindLearnButtons($('#msgs'));
    scrollMsgs();
    renderComposer();
    renderInfo(d, $('#iinfo'));
  }

  function renderChatHeader(c) {
    const el = $('#chh'); if (!el) return;
    if (S.detail && S.detail.id === c.id) Object.assign(S.detail, c);
    const mine = c.status === 'human' && c.assigned_to === S.user.id;
    el.innerHTML = `
      <b>${esc(c.visitor_name || 'زائر #' + c.id)}</b> <span class="tag ${c.status}">${STATUS[c.status]}</span>
      ${c.agent_name ? `<span class="muted">· ${esc(c.agent_name)}</span>` : ''}<span class="sp"></span>
      ${c.status !== 'closed' && !mine ? `<button class="btn sm pri" id="take">${c.status === 'human' ? 'استلام منه' : 'استلام المحادثة'}</button>` : ''}
      ${c.status !== 'closed' ? `<button class="btn sm" id="xfer">تحويل لموظف</button>` : ''}
      ${c.status === 'human' || c.status === 'waiting' ? `<button class="btn sm" id="tobot">إعادة للبوت</button>` : ''}
      ${c.status !== 'closed' ? `<button class="btn sm dan" id="close">إنهاء</button>` : ''}
      <a class="btn sm" href="/api/conversations/${c.id}/export" id="exp">⬇︎</a>`;
    $('#take', el)?.addEventListener('click', () => S.socket.emit('take', { id: c.id }, r => r?.error && err(r.error)));
    $('#tobot', el)?.addEventListener('click', () => S.socket.emit('return_to_bot', { id: c.id }));
    $('#close', el)?.addEventListener('click', () => { if (confirm('إنهاء المحادثة؟ سيظهر للمستفيد طلب التقييم.')) S.socket.emit('close', { id: c.id }); });
    $('#xfer', el)?.addEventListener('click', () => transferModal(c.id));
    $('#exp', el).onclick = (e) => { e.preventDefault(); download(`/api/conversations/${c.id}/export`, `conversation-${c.id}.txt`); };
    renderComposer();
  }

  async function download(url, name) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + S.token } });
    const b = await r.blob(); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.click();
  }

  function transferModal(id) {
    const others = S.users.filter(u => u.active && u.id !== S.user.id);
    modal(`<h3>تحويل المحادثة</h3>
      <label class="f"><span>اختر الموظف</span><select id="to">${others.map(u => `<option value="${u.id}">${esc(u.name)} ${S.online.some(o => o.id === u.id) ? '🟢' : '⚪'}</option>`).join('')}</select></label>
      <div class="row"><button class="btn pri" id="go">تحويل</button><button class="btn" data-close>إلغاء</button></div>`, (m, close) => {
      $('#go', m).onclick = () => S.socket.emit('transfer', { id, to: Number($('#to', m).value) }, (r) => { r?.error ? err(r.error) : (ok('تم التحويل'), close()); });
    });
  }

  function renderComposer() {
    const el = $('#comp'); const d = S.detail; if (!el || !d) return;
    if (d.status === 'closed') { el.innerHTML = `<div class="muted" style="text-align:center">المحادثة مغلقة ${d.rating != null ? '· التقييم ' + stars(d.rating, d.rating_max) : ''}</div>`; return; }
    const autoLearn = site()?.settings.behavior.auto_learn !== false;
    el.innerHTML = `
      ${d.pending_question ? `<div class="pending">❓ سؤال لم يجد له البوت إجابة: <b>${esc(d.pending_question)}</b>
        <label class="chk" style="margin:6px 0 0"><input type="checkbox" id="learn" ${autoLearn ? 'checked' : ''}> احفظ ردّي التالي كإجابة لهذا السؤال ليجيب عنه البوت تلقائياً مستقبلاً</label></div>` : ''}
      <div class="row" style="align-items:flex-end">
        <textarea id="txt" placeholder="${d.status === 'human' && d.assigned_to === S.user.id ? 'اكتب ردك... (Enter للإرسال، Shift+Enter لسطر جديد)' : 'اكتب لاستلام المحادثة والرد مباشرة...'}" style="flex:1"></textarea>
        <button class="btn pri" id="snd" style="height:60px">إرسال</button>
      </div>`;
    const txt = $('#txt'); let tt;
    const send = () => {
      const t = txt.value.trim(); if (!t) return;
      const learn = $('#learn')?.checked;
      S.socket.emit('send', { id: d.id, text: t, learn }, (r) => {
        if (r?.error) return err(r.error === 'assigned' ? 'المحادثة مستلمة من موظف آخر' : r.error);
        if (r.learned) { d.pending_question = null; renderComposer(); }
      });
      txt.value = ''; S.socket.emit('typing', { id: d.id, typing: false });
    };
    $('#snd').onclick = send;
    txt.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    txt.oninput = () => { S.socket.emit('typing', { id: d.id, typing: true }); clearTimeout(tt); tt = setTimeout(() => S.socket.emit('typing', { id: d.id, typing: false }), 2000); };
    txt.focus();
  }

  function msgHTML(m) {
    const who = m.sender === 'agent' ? (m.agent_name || 'موظف') : SENDER[m.sender];
    return `<div class="m ${m.sender}" data-id="${m.id}">
      ${m.sender !== 'system' ? `<div class="w">${esc(who)} · ${fmtDate(m.created_at)}${m.sender === 'agent' ? ` <button class="learn" data-id="${m.id}">📚 حفظ في قاعدة المعرفة</button>` : ''}</div>` : ''}
      <div class="b">${esc(m.body).replace(/\*([^*\n]+)\*/g, '<b>$1</b>')}${m.link ? `<br><a href="${esc(m.link)}" target="_blank">${esc(m.link)}</a>` : ''}</div>
      ${m.options?.length ? `<div class="opts">${m.options.map(o => `<span>${esc(o.label)}</span>`).join('')}</div>` : ''}
    </div>`;
  }
  function appendMsg(m) {
    const box = $('#msgs'); if (!box) return;
    box.insertAdjacentHTML('beforeend', msgHTML(m)); bindLearnButtons(box); scrollMsgs();
    const t = $('#typing'); if (t && m.sender === 'visitor') t.textContent = '';
  }
  const scrollMsgs = () => { const b = $('#msgs'); if (b) b.scrollTop = b.scrollHeight; };

  function bindLearnButtons(box) {
    $$('.learn', box).forEach(b => b.onclick = () => {
      const d = S.detail; const idx = d.messages.findIndex(m => m.id === Number(b.dataset.id));
      const ans = d.messages[idx]; let q = '';
      for (let i = idx - 1; i >= 0; i--) if (d.messages[i].sender === 'visitor') { q = d.messages[i].body; break; }
      kbModal({ question: d.pending_question || q, answer: ans.body, conversation_id: d.id, site_id: d.site_id });
    });
  }

  function renderInfo(d, el) {
    if (!el) return;
    const cust = d.meta?.customer;
    el.innerHTML = `
      <h4 style="margin-top:0">بيانات المستفيد</h4>
      <div class="kv">
        <span>الاسم</span><b>${esc(d.visitor_name || '-')} ${d.verified ? '✅' : ''}</b>
        <span>الجوال</span><b dir="ltr" style="text-align:right">${esc(d.visitor_phone || '-')}</b>
        <span>البريد</span><b>${esc(d.visitor_email || '-')}</b>
        <span>الموقع</span><b>${esc(d.site_name || '')}</b>
        <span>الصفحة</span><b>${d.page_url ? `<a href="${esc(d.page_url)}" target="_blank">${esc(d.page_url.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : '-'}</b>
        <span>البداية</span><b>${fmtDate(d.created_at)}</b>
        ${d.handoff_at ? `<span>التحويل</span><b>${fmtDate(d.handoff_at)}</b>` : ''}
        ${d.closed_at ? `<span>الإغلاق</span><b>${fmtDate(d.closed_at)}</b><span>أغلقها</span><b>${CLOSED_BY[d.closed_by] || '-'}${d.closed_by_name ? ' (' + esc(d.closed_by_name) + ')' : ''}</b>` : ''}
      </div>
      ${cust ? `<h4>من قاعدة البيانات</h4><div class="kv">${Object.entries(cust).map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>` : ''}
      ${d.meta?.lookups?.length ? `<h4>استعلامات الطلبات</h4>${d.meta.lookups.map(l => `<div style="font-size:13px;margin-bottom:6px;padding:8px;background:var(--soft);border-radius:8px">${Object.entries(l.params).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join(' · ')}<br>${l.rows.map(r => esc(r.status || JSON.stringify(r))).join('، ')}</div>`).join('')}` : ''}
      <h4>التقييم</h4>${d.rating != null ? stars(d.rating, d.rating_max) + (d.rating_comment ? `<p style="font-size:13px">"${esc(d.rating_comment)}"</p>` : '') : '<span class="muted">لم يقيّم بعد</span>'}
      <h4>الجهاز</h4><div class="muted" style="font-size:12px;overflow-wrap:anywhere">${esc(d.meta?.ua || '-')}</div>`;
  }

  /* ============================ history ============================ */
  let HF = { status: 'closed', closed_by: '', rated: '', handoff: '', q: '', from: '', to: '', page: 1 };
  async function renderHistory() {
    setTitle('سجل المحادثات');
    $('#ct').innerHTML = `
      <div class="card" style="margin-bottom:16px"><form class="row" id="hf">
        <select name="status" style="width:auto"><option value="closed">المغلقة</option><option value="">الكل</option><option value="active">النشطة</option><option value="waiting">بانتظار موظف</option><option value="human">مع موظف</option><option value="bot">مع البوت</option></select>
        <select name="closed_by" style="width:auto"><option value="">أغلقها: الكل</option><option value="visitor">المستفيد</option><option value="agent">الموظف</option><option value="system">النظام</option></select>
        <select name="rated" style="width:auto"><option value="">التقييم: الكل</option><option value="yes">مقيّمة</option><option value="no">غير مقيّمة</option></select>
        <select name="handoff" style="width:auto"><option value="">التحويل: الكل</option><option value="yes">حُوّلت لموظف</option><option value="no">حلّها البوت</option></select>
        <input type="date" name="from" style="width:auto" title="من"><input type="date" name="to" style="width:auto" title="إلى">
        <input name="q" placeholder="بحث بالاسم، الجوال، البريد، رقم المحادثة أو نص الرسائل" style="flex:1;min-width:220px">
        <button class="btn pri">بحث</button>
      </form></div>
      <div class="card" style="padding:0;overflow:auto"><div id="ht"></div></div>`;
    const f = $('#hf');
    Object.entries(HF).forEach(([k, v]) => { if (f[k]) f[k].value = v; });
    f.onsubmit = (e) => { e.preventDefault(); HF = { ...Object.fromEntries(new FormData(f)), page: 1 }; loadHistory(); };
    loadHistory();
  }
  async function loadHistory() {
    const qs = new URLSearchParams({ ...HF, site: S.siteId, limit: 30 });
    [...qs.keys()].forEach(k => !qs.get(k) && qs.delete(k));
    const r = await api('GET', '/api/conversations?' + qs);
    const max = site()?.settings.appearance.rating_max || 5;
    const pages = Math.ceil(r.total / r.limit);
    $('#ht').innerHTML = r.items.length ? `
      <table><thead><tr><th>#</th><th>المستفيد</th><th>الحالة</th><th>أغلقها</th><th>الموظف</th><th>التقييم</th><th>آخر رسالة</th><th>التاريخ</th></tr></thead>
      <tbody>${r.items.map(c => `<tr class="click" data-id="${c.id}">
        <td>${c.id}</td><td><b>${esc(c.visitor_name || 'زائر')}</b>${c.verified ? ' ✅' : ''}<br><small class="muted" dir="ltr">${esc(c.visitor_phone || c.visitor_email || '')}</small></td>
        <td><span class="tag ${c.status}">${STATUS[c.status]}</span>${c.handoff_at ? '<br><small class="muted">حُوّلت لموظف</small>' : ''}</td>
        <td>${c.closed_by ? `<span class="tag ${c.closed_by}">${CLOSED_BY[c.closed_by]}</span>` : '-'}</td>
        <td>${esc(c.agent_name || '-')}</td><td>${stars(c.rating, max)}</td>
        <td style="max-width:260px" class="muted">${esc(c.last_message?.body || '').slice(0, 70)}</td>
        <td><small>${fmtDate(c.closed_at || c.updated_at)}</small></td></tr>`).join('')}</tbody></table>
      <div class="row" style="padding:12px"><span class="muted">الإجمالي: ${r.total}</span><span class="sp"></span>
        <button class="btn sm" id="pv" ${HF.page <= 1 ? 'disabled' : ''}>السابق</button><span>${HF.page} / ${pages}</span><button class="btn sm" id="nx" ${HF.page >= pages ? 'disabled' : ''}>التالي</button></div>`
      : '<div class="empty">لا توجد محادثات مطابقة</div>';
    $$('tr.click', $('#ht')).forEach(tr => tr.onclick = () => location.hash = '#/conv/' + tr.dataset.id);
    $('#pv')?.addEventListener('click', () => { HF.page--; loadHistory(); });
    $('#nx')?.addEventListener('click', () => { HF.page++; loadHistory(); });
  }

  async function renderConvPage(id) {
    setTitle('محادثة #' + id);
    let d;
    try { d = await api('GET', '/api/conversations/' + id); } catch (e) { return err(e); }
    S.detail = d;
    $('#ct').innerHTML = `
      <div class="row" style="margin-bottom:14px"><a class="btn" href="#/history">→ رجوع للسجل</a><span class="sp"></span>
        ${d.status !== 'closed' ? `<button class="btn pri" id="goin">فتح في المحادثات الحية</button>` : ''}
        <button class="btn" id="exp">⬇︎ تصدير</button>${can('supervisor') ? '<button class="btn dan" id="del">حذف المحادثة</button>' : ''}</div>
      <div class="grid" style="grid-template-columns:1fr 320px;align-items:start">
        <div class="card" style="padding:0;background:var(--bg)"><div class="msgs" id="msgs" style="max-height:calc(100vh - 210px)">${d.messages.map(msgHTML).join('')}</div></div>
        <div class="card info" id="cinfo" style="display:block"></div>
      </div>`;
    renderInfo(d, $('#cinfo'));
    bindLearnButtons($('#msgs'));
    $('#exp').onclick = () => download(`/api/conversations/${id}/export`, `conversation-${id}.txt`);
    $('#goin')?.addEventListener('click', () => { S.selected = id; location.hash = '#/inbox'; });
    $('#del')?.addEventListener('click', async () => { if (confirm('حذف المحادثة نهائياً؟')) { await api('DELETE', '/api/conversations/' + id); ok('تم الحذف'); location.hash = '#/history'; } });
  }

  /* ============================ stats ============================ */
  async function renderStats() {
    setTitle('الإحصائيات');
    $('#ct').innerHTML = `<div class="row" style="margin-bottom:14px">الفترة: <select id="days" style="width:auto"><option value="7">7 أيام</option><option value="30" selected>30 يوم</option><option value="90">90 يوم</option><option value="365">سنة</option></select></div><div id="st"></div>`;
    const load = async () => {
      const s = await api('GET', `/api/stats?site=${S.siteId}&days=${$('#days').value}`);
      const cb = Object.fromEntries(s.closed_by.map(x => [x.k, x.c]));
      const maxDay = Math.max(1, ...s.per_day.map(d => d.c));
      const totalRated = s.ratings.reduce((a, b) => a + b.c, 0) || 1;
      const botRate = s.total ? Math.round((s.bot_only / s.total) * 100) : 0;
      $('#st').innerHTML = `
      <div class="grid g4" style="margin-bottom:16px">
        <div class="card stat"><span>إجمالي المحادثات</span><b>${s.total}</b></div>
        <div class="card stat"><span>نشطة الآن / بانتظار موظف</span><b>${s.active} / <span style="color:var(--warn)">${s.waiting}</span></b></div>
        <div class="card stat"><span>حلّها البوت دون تحويل</span><b>${s.bot_only} <small class="muted" style="font-size:14px">(${botRate}%)</small></b></div>
        <div class="card stat"><span>متوسط التقييم (${s.avg_rating.n} تقييم)</span><b>${s.avg_rating.a != null ? stars(s.avg_rating.a, s.rating_max) : '—'}</b></div>
      </div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card"><h3>المحادثات يومياً <small class="muted">(البرتقالي = حُوّلت لموظف)</small></h3>
          <div class="bars">${s.per_day.map(d => `<div style="height:${(d.c / maxDay) * 100}%" title="${d.d}: ${d.c} محادثة، ${d.h} تحويل"><span style="height:${d.c ? (d.h / d.c) * 100 : 0}%"></span></div>`).join('') || '<div class="empty" style="background:none">لا بيانات</div>'}</div></div>
        <div class="card"><h3>توزيع التقييمات</h3>${s.ratings.length ? s.ratings.map(r => `<div class="hbar"><span style="width:50px">${r.k}</span><div class="tr"><div style="width:${(r.c / totalRated) * 100}%;background:${ratingColor(r.k, s.rating_max)}"></div></div><span>${r.c}</span></div>`).join('') : '<div class="empty">لا توجد تقييمات</div>'}</div>
      </div>
      <div class="grid g3">
        <div class="card"><h3>من أغلق المحادثات</h3>
          <div class="kv"><span>المستفيد</span><b>${cb.visitor || 0}</b><span>الموظف</span><b>${cb.agent || 0}</b><span>النظام</span><b>${cb.system || 0}</b><span>التحويلات</span><b>${s.handoffs}</b></div></div>
        <div class="card"><h3>أداء الموظفين</h3>${s.agents.length ? `<table><tr><th>الموظف</th><th>محادثات</th><th>تقييم</th></tr>${s.agents.map(a => `<tr><td>${esc(a.name)}</td><td>${a.c}</td><td>${a.r ?? '—'}</td></tr>`).join('')}</table>` : '<div class="empty">—</div>'}</div>
        <div class="card"><h3>قاعدة المعرفة</h3><div class="kv"><span>الإجابات</span><b>${s.kb.total || 0}</b><span>المتعلَّمة</span><b>${s.kb.learned || 0}</b><span>مرات الاستخدام</span><b>${s.kb.hits || 0}</b></div>
          ${s.top_kb.length ? '<h4 style="font-size:13px;color:var(--muted)">الأكثر سؤالاً</h4>' + s.top_kb.map(k => `<div style="font-size:13px">• ${esc(k.question)} <b>(${k.hits})</b></div>`).join('') : ''}</div>
      </div>`;
    };
    $('#days').onchange = load; load();
  }

  /* ============================ tree ============================ */
  function renderTree() {
    setTitle('شجرة الردود');
    let tree = JSON.parse(JSON.stringify(site().tree));
    let openNode = tree.root;
    const draw = () => {
      const ids = tree.nodes.map(n => n.id);
      $('#ct').innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 320px;align-items:start">
        <div>
          <div class="card" style="margin-bottom:14px"><div class="row"><b>العقد (${tree.nodes.length})</b><span class="sp"></span>
            <button class="btn" id="add">+ عقدة جديدة</button><button class="btn" id="reset">استعادة الافتراضي</button><button class="btn pri" id="save">💾 حفظ الشجرة</button></div>
            <p class="muted" style="margin:10px 0 0;font-size:13px">كل عقدة = رسالة من البوت + أزرار. كل زر ينفذ إجراء: الانتقال لعقدة أخرى، رد نصي، استعلام من قاعدة البيانات، تحويل لموظف، فتح رابط أو إنهاء. يمكنك استخدام <code>{name}</code> لاسم المستفيد.</p></div>
          ${tree.nodes.map((n, ni) => `
          <div class="node ${n.id === tree.root ? 'root' : ''}" data-ni="${ni}">
            <div class="nh" data-toggle="${n.id}"><b>${esc(n.title || n.id)}</b><code class="muted">${esc(n.id)}</code>${n.id === tree.root ? '<span class="tag human">البداية</span>' : ''}<span class="sp"></span><span class="muted">${(n.options || []).length} أزرار ${openNode === n.id ? '▲' : '▼'}</span></div>
            <div class="nb ${openNode === n.id ? '' : 'hidden'}">
              <div class="grid g2"><label class="f"><span>اسم العقدة (للإدارة)</span><input data-k="title" value="${esc(n.title || '')}"></label>
              <label class="f"><span>المعرّف</span><input data-k="id" value="${esc(n.id)}" dir="ltr"></label></div>
              <label class="f"><span>رسالة البوت</span><textarea data-k="message" rows="3">${esc(n.message)}</textarea></label>
              <div class="muted" style="font-size:13px;margin-bottom:6px">الأزرار:</div>
              ${(n.options || []).map((o, oi) => `
              <div class="opt-row" data-oi="${oi}">
                <input data-o="label" value="${esc(o.label)}" placeholder="نص الزر">
                <select data-o="action">${Object.entries(ACTIONS).map(([k, l]) => `<option value="${k}" ${o.action === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                ${o.action === 'goto' ? `<select data-o="target">${ids.map(id => `<option ${o.target === id ? 'selected' : ''}>${esc(id)}</option>`).join('')}</select>`
          : o.action === 'url' ? `<input data-o="target" value="${esc(o.target || '')}" placeholder="https://..." dir="ltr">`
            : o.action === 'answer' ? `<input data-o="target" value="${esc(o.target || '')}" placeholder="نص الرد">` : '<span class="muted" style="font-size:12px">—</span>'}
                <button class="btn sm" data-mv="-1" title="أعلى">↑</button><button class="btn sm" data-mv="1" title="أسفل">↓</button><button class="btn sm dan" data-del="1">✕</button>
              </div>`).join('')}
              <div class="row" style="margin-top:10px"><button class="btn sm" data-addopt>+ زر</button><span class="sp"></span>
                ${n.id !== tree.root ? `<button class="btn sm" data-root>تعيين كبداية</button><button class="btn sm dan" data-delnode>حذف العقدة</button>` : ''}</div>
            </div>
          </div>`).join('')}
        </div>
        <div class="card" style="position:sticky;top:0"><h3>خريطة التدفق</h3><div class="flow">${flowHTML(tree)}</div></div>
      </div>`;
      $('#add').onclick = () => { const id = 'node' + (tree.nodes.length + 1) + Math.random().toString(36).slice(2, 5); tree.nodes.push({ id, title: 'عقدة جديدة', message: 'اكتب الرسالة هنا', options: [{ label: '🏠 القائمة الرئيسية', action: 'goto', target: tree.root }] }); openNode = id; draw(); };
      $('#reset').onclick = async () => { if (confirm('استعادة الشجرة الافتراضية؟ ستفقد تعديلاتك.')) { const r = await api('POST', `/api/sites/${site().id}/reset-tree`); site().tree = r.tree; renderTree(); } };
      $('#save').onclick = async () => {
        const dup = tree.nodes.map(n => n.id).filter((v, i, a) => a.indexOf(v) !== i);
        if (dup.length) return err('معرّف مكرر: ' + dup[0]);
        await saveSite({ tree }, 'تم حفظ الشجرة');
      };
      $$('[data-toggle]').forEach(h => h.onclick = () => { openNode = openNode === h.dataset.toggle ? null : h.dataset.toggle; draw(); });
      $$('.node').forEach(el => {
        const n = tree.nodes[Number(el.dataset.ni)];
        $$('[data-k]', el).forEach(inp => inp.onchange = () => {
          const k = inp.dataset.k, v = inp.value.trim();
          if (k === 'id') {
            if (!v || tree.nodes.some(x => x !== n && x.id === v)) { err('معرّف غير صالح أو مكرر'); inp.value = n.id; return; }
            tree.nodes.forEach(x => (x.options || []).forEach(o => { if (o.action === 'goto' && o.target === n.id) o.target = v; }));
            if (tree.root === n.id) tree.root = v;
            if (openNode === n.id) openNode = v;
            n.id = v; draw();
          } else n[k] = inp.value;
        });
        $$('.opt-row', el).forEach(r => {
          const o = n.options[Number(r.dataset.oi)];
          $$('[data-o]', r).forEach(inp => inp.onchange = () => {
            o[inp.dataset.o] = inp.value;
            if (inp.dataset.o === 'action') { o.target = o.action === 'goto' ? tree.root : ''; draw(); }
          });
          $('[data-del]', r).onclick = () => { n.options.splice(Number(r.dataset.oi), 1); draw(); };
          $$('[data-mv]', r).forEach(b => b.onclick = () => {
            const i = Number(r.dataset.oi), j = i + Number(b.dataset.mv);
            if (j < 0 || j >= n.options.length) return; [n.options[i], n.options[j]] = [n.options[j], n.options[i]]; draw();
          });
        });
        $('[data-addopt]', el).onclick = () => { (n.options = n.options || []).push({ label: 'زر جديد', action: 'handoff', target: '' }); draw(); };
        $('[data-root]', el)?.addEventListener('click', () => { tree.root = n.id; draw(); });
        $('[data-delnode]', el)?.addEventListener('click', () => {
          if (!confirm('حذف العقدة؟')) return;
          tree.nodes.splice(Number(el.dataset.ni), 1);
          tree.nodes.forEach(x => (x.options || []).forEach(o => { if (o.action === 'goto' && o.target === n.id) o.target = tree.root; }));
          draw();
        });
      });
    };
    draw();
  }

  function flowHTML(tree) {
    const seen = new Set();
    const icon = { goto: '➜', answer: '💬', order_status: '📦', customer_info: '👤', handoff: '🙋', url: '🔗', end: '⏹' };
    const walk = (id, depth) => {
      const n = tree.nodes.find(x => x.id === id); if (!n) return '';
      if (seen.has(id) || depth > 6) return `<li class="muted">↺ ${esc(n.title || id)}</li>`;
      seen.add(id);
      return `<li><b>${esc(n.title || id)}</b><ul>${(n.options || []).map(o => o.action === 'goto' ? `<li>${esc(o.label)}<ul>${walk(o.target, depth + 1)}</ul></li>` : `<li>${/^\p{L}/u.test(o.label) ? (icon[o.action] || '') + ' ' : ''}${esc(o.label)} <span class="muted">(${ACTIONS[o.action]})</span></li>`).join('')}</ul></li>`;
    };
    const orphan = tree.nodes.filter(n => n.id !== tree.root && !tree.nodes.some(x => (x.options || []).some(o => o.action === 'goto' && o.target === n.id)));
    return `<ul style="border:0;padding:0">${walk(tree.root, 0)}</ul>${orphan.length ? `<p class="muted" style="font-size:12px">⚠️ عقد غير مرتبطة: ${orphan.map(n => esc(n.id)).join('، ')}</p>` : ''}`;
  }

  /* ============================ knowledge base ============================ */
  function kbModal(item = {}) {
    modal(`<h3>${item.id ? 'تعديل إجابة' : 'إضافة إجابة إلى قاعدة المعرفة'}</h3>
      <label class="f"><span>السؤال</span><input id="kq" value="${esc(item.question || '')}"></label>
      <label class="f"><span>الإجابة</span><textarea id="ka" rows="4">${esc(item.answer || '')}</textarea></label>
      <label class="f"><span>كلمات مفتاحية (اختياري، مفصولة بفاصلة)</span><input id="kk" value="${esc(item.keywords || '')}" placeholder="شحن، توصيل، مدة"><small>تساعد البوت على مطابقة أسئلة مختلفة الصياغة</small></label>
      <div class="row"><button class="btn pri" id="ks">حفظ</button><button class="btn" data-close>إلغاء</button></div>`, (m, close) => {
      $('#ks', m).onclick = async () => {
        const body = { question: $('#kq', m).value, answer: $('#ka', m).value, keywords: $('#kk', m).value };
        try {
          if (item.id) await api('PUT', '/api/kb/' + item.id, body);
          else await api('POST', '/api/kb', { ...body, site_id: item.site_id || S.siteId, conversation_id: item.conversation_id });
          ok('تم الحفظ'); close(); if (page() === 'kb') loadKB();
        } catch (e) { err(e); }
      };
    });
  }

  let KBF = { q: '', source: '' };
  function renderKB() {
    setTitle('قاعدة المعرفة');
    $('#ct').innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 340px;align-items:start">
        <div>
          <div class="card" style="margin-bottom:14px"><div class="row">
            <input id="kbq" placeholder="بحث..." style="flex:1;min-width:180px" value="${esc(KBF.q)}">
            <select id="kbs" style="width:auto"><option value="">الكل</option><option value="learned">المتعلَّمة من الموظفين</option><option value="manual">المضافة يدوياً</option></select>
            <button class="btn pri" id="kbadd">+ إضافة</button></div></div>
          <div class="card" style="padding:0;overflow:auto" id="kbt"></div>
        </div>
        <div class="card"><h3>🧪 اختبار البوت</h3><p class="muted" style="font-size:13px;margin-top:0">اكتب سؤالاً لترى أي إجابة سيختارها البوت ودرجة التطابق.</p>
          <textarea id="kbtest" rows="2" placeholder="مثال: متى يوصل الطلب؟"></textarea><button class="btn" id="kbtb" style="margin-top:8px">اختبار</button><div id="kbtr" style="margin-top:10px;font-size:13px"></div></div>
      </div>`;
    $('#kbs').value = KBF.source;
    $('#kbq').oninput = (e) => { KBF.q = e.target.value; clearTimeout(KBF.t); KBF.t = setTimeout(loadKB, 300); };
    $('#kbs').onchange = (e) => { KBF.source = e.target.value; loadKB(); };
    $('#kbadd').onclick = () => kbModal();
    $('#kbtb').onclick = async () => {
      const r = await api('POST', '/api/kb/test', { site_id: S.siteId, text: $('#kbtest').value });
      const th = site().settings.behavior.kb_threshold;
      $('#kbtr').innerHTML = (r.best ? `<div class="pending" style="background:var(--brand-soft);border-color:#bbf7d0">✅ سيجيب البوت بـ: <b>${esc(r.best.answer)}</b> (${r.best.score})</div>` : `<div class="pending">⚠️ لا توجد إجابة فوق الحد (${th}) → سيتم التحويل لموظف</div>`)
        + r.top.map(t => `<div>${t.score} — ${esc(t.question)}</div>`).join('');
    };
    loadKB();
  }
  async function loadKB() {
    const items = await api('GET', `/api/kb?site=${S.siteId}&q=${encodeURIComponent(KBF.q)}&source=${KBF.source}`);
    $('#kbt').innerHTML = items.length ? `<table><thead><tr><th>السؤال</th><th>الإجابة</th><th>المصدر</th><th>استخدام</th><th>مفعّل</th><th></th></tr></thead><tbody>
      ${items.map(k => `<tr data-id="${k.id}"><td><b>${esc(k.question)}</b>${k.keywords ? `<br><small class="muted">🔑 ${esc(k.keywords)}</small>` : ''}</td><td style="max-width:320px">${esc(k.answer)}</td>
        <td><span class="tag ${k.source}">${k.source === 'learned' ? 'متعلَّمة' : 'يدوي'}</span>${k.source_conversation ? `<br><a href="#/conv/${k.source_conversation}" style="font-size:12px">محادثة #${k.source_conversation}</a>` : ''}</td>
        <td>${k.hits}</td><td><input type="checkbox" data-act ${k.active ? 'checked' : ''}></td>
        <td style="white-space:nowrap"><button class="btn sm" data-ed>تعديل</button>${can('supervisor') ? '<button class="btn sm dan" data-rm>حذف</button>' : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">لا توجد إجابات. أضف إجابات يدوياً، أو ستُحفظ تلقائياً عندما يرد الموظفون على أسئلة لم يعرفها البوت.</div>';
    $$('tr[data-id]', $('#kbt')).forEach(tr => {
      const k = items.find(x => x.id === Number(tr.dataset.id));
      $('[data-ed]', tr).onclick = () => kbModal(k);
      $('[data-rm]', tr)?.addEventListener('click', async () => { if (confirm('حذف؟')) { await api('DELETE', '/api/kb/' + k.id); loadKB(); } });
      $('[data-act]', tr).onchange = (e) => api('PUT', '/api/kb/' + k.id, { active: e.target.checked }).then(() => ok('تم'));
    });
  }

  /* ============================ behavior ============================ */
  function renderBehavior() {
    setTitle('سلوك البوت');
    const b = site().settings.behavior;
    $('#ct').innerHTML = `<form id="bf" class="grid g2" style="align-items:start">
      <div class="card"><h3>🧠 الفهم والتعلّم</h3>
        <label class="chk"><input type="checkbox" name="auto_learn" ${b.auto_learn ? 'checked' : ''}> التعلّم التلقائي: حفظ رد الموظف كإجابة للسؤال الذي لم يعرفه البوت</label>
        <label class="f"><span>حد التطابق مع قاعدة المعرفة (0.3 - 0.95)</span><input type="number" step="0.05" min="0.3" max="0.95" name="kb_threshold" value="${b.kb_threshold}"><small>أقل = البوت يجيب أكثر لكن قد يخطئ. أعلى = أدق لكن يحوّل أكثر.</small></label>
        <label class="f"><span>عند عدم وجود إجابة</span><select name="no_answer_action"><option value="handoff" ${b.no_answer_action === 'handoff' ? 'selected' : ''}>تحويل فوري لموظف بشري</option><option value="fallback" ${b.no_answer_action === 'fallback' ? 'selected' : ''}>عرض رسالة وخيارات</option></select></label>
        <label class="f"><span>كلمات طلب حالة الطلب (سطر لكل عبارة)</span><textarea name="order_keywords" rows="4">${esc((b.order_keywords || []).join('\n'))}</textarea></label>
        <label class="f"><span>كلمات طلب موظف بشري (سطر لكل عبارة)</span><textarea name="handoff_keywords" rows="4">${esc((b.handoff_keywords || []).join('\n'))}</textarea></label>
      </div>
      <div class="card"><h3>💬 الرسائل</h3>
        <label class="f"><span>رسالة التحويل لموظف (بطلب المستفيد)</span><textarea name="handoff_message" rows="2">${esc(b.handoff_message)}</textarea></label>
        <label class="f"><span>رسالة التحويل عند عدم وجود إجابة</span><textarea name="no_answer_handoff_message" rows="2">${esc(b.no_answer_handoff_message)}</textarea></label>
        <label class="f"><span>رسالة عدم الفهم (وضع الخيارات)</span><textarea name="fallback_message" rows="2">${esc(b.fallback_message)}</textarea></label>
        <label class="f"><span>عند انضمام موظف ({agent} = اسم الموظف)</span><input name="agent_joined_message" value="${esc(b.agent_joined_message)}"></label>
        <label class="f"><span>رسالة إنهاء المحادثة</span><input name="closed_message" value="${esc(b.closed_message)}"></label>
        <label class="f"><span>سؤال "هل تحتاج شيئاً آخر؟"</span><input name="anything_else" value="${esc(b.anything_else)}"></label>
      </div>
      <div class="card"><h3>⏱️ الحفظ والإغلاق التلقائي</h3>
        <label class="f"><span>مدة حفظ المحادثات (بالأيام)</span><input type="number" min="0" name="retention_days" value="${b.retention_days}"><small>تُحذف المحادثات المغلقة الأقدم من هذه المدة تلقائياً. 0 = حفظ دائم.</small></label>
        <label class="f"><span>إغلاق المحادثة تلقائياً بعد عدم نشاط (بالدقائق)</span><input type="number" min="0" name="inactivity_minutes" value="${b.inactivity_minutes}"><small>0 = تعطيل. تظهر في السجل كـ "أغلقها النظام".</small></label>
      </div>
      <div style="grid-column:1/-1"><button class="btn pri">💾 حفظ الإعدادات</button></div>
    </form>`;
    $('#bf').onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      const lines = (s) => s.split('\n').map(x => x.trim()).filter(Boolean);
      saveSite({ settings: { behavior: {
        auto_learn: f.auto_learn.checked, kb_threshold: Number(f.kb_threshold.value), no_answer_action: f.no_answer_action.value,
        order_keywords: lines(f.order_keywords.value), handoff_keywords: lines(f.handoff_keywords.value),
        handoff_message: f.handoff_message.value, no_answer_handoff_message: f.no_answer_handoff_message.value, fallback_message: f.fallback_message.value,
        agent_joined_message: f.agent_joined_message.value, closed_message: f.closed_message.value, anything_else: f.anything_else.value,
        retention_days: Number(f.retention_days.value), inactivity_minutes: Number(f.inactivity_minutes.value)
      } } });
    };
  }

  /* ============================ datasource ============================ */
  function renderDatasource() {
    setTitle('ربط قاعدة البيانات');
    const d = site().settings.datasource;
    $('#ct').innerHTML = `<form id="df" class="grid g2" style="align-items:start">
      <div class="card"><h3>🔗 الاتصال</h3>
        <label class="f"><span>نوع المصدر</span><select name="type">
          <option value="none">بدون ربط</option><option value="demo">بيانات تجريبية (للاختبار)</option><option value="mysql">MySQL / MariaDB (ووردبريس، ووكومرس...)</option><option value="postgres">PostgreSQL</option><option value="api">REST API</option></select></label>
        <div id="dbf"><label class="f"><span>رابط الاتصال</span><input name="connection" value="${esc(d.connection)}" dir="ltr" placeholder="mysql://user:pass@host:3306/dbname">
          <small>يفضّل إنشاء مستخدم بصلاحية قراءة فقط (SELECT). يُسمح فقط باستعلامات SELECT.</small></label></div>
        <div id="apif"><label class="f"><span>رابط الـ API الأساسي</span><input name="api_url" value="${esc(d.api_url)}" dir="ltr" placeholder="https://example.com/api"></label>
          <label class="f"><span>Headers (JSON)</span><textarea name="api_headers" dir="ltr" rows="2">${esc(d.api_headers)}</textarea></label></div>
        <h3 style="margin-top:20px">📦 استعلام حالة الطلب</h3>
        <label class="f"><span id="ql">الاستعلام</span><textarea name="order_query" dir="ltr" rows="3" class="mono">${esc(d.order_query)}</textarea>
          <small>استخدم متغيرات مثل <code>:order_no</code> <code>:phone</code> <code>:email</code> — سيطلبها البوت من المستفيد تلقائياً. أعد أعمدة مثل <code>status</code> و <code>notes</code>. لنوع API اكتب المسار مثل <code>/orders/{order_no}?phone={phone}</code></small></label>
        <label class="f"><span>قالب رد حالة الطلب</span><textarea name="order_template" rows="2">${esc(d.order_template)}</textarea><small>أي عمود يُكتب بين {} مثل {status}. *نص* = خط عريض</small></label>
        <label class="f"><span>قالب الملاحظات (يظهر فقط إن وُجدت ملاحظات)</span><input name="notes_template" value="${esc(d.notes_template)}"></label>
        <label class="f"><span>رسالة عدم العثور</span><input name="not_found" value="${esc(d.not_found)}"></label>
        <label class="f"><span>رسالة تعذر الاتصال</span><input name="error_message" value="${esc(d.error_message)}"></label>
        <h3 style="margin-top:20px">👤 بيانات المستفيد</h3>
        <label class="f"><span>استعلام بيانات المستفيد</span><textarea name="customer_query" dir="ltr" rows="2" class="mono">${esc(d.customer_query)}</textarea><small>يُنفّذ تلقائياً عند بدء المحادثة إن توفر الجوال أو البريد الموثق، وتظهر البيانات للموظف.</small></label>
        <label class="f"><span>قالب عرض البيانات للمستفيد</span><textarea name="customer_template" rows="3">${esc(d.customer_template)}</textarea></label>
        <h3 style="margin-top:20px">❓ أسئلة البوت لكل متغير</h3>
        ${Object.entries(d.param_prompts).map(([k, v]) => `<label class="f"><span><code>:${esc(k)}</code></span><input data-pp="${esc(k)}" value="${esc(v)}"></label>`).join('')}
        <div class="row"><input id="newp" placeholder="متغير جديد مثل id_number" dir="ltr" style="flex:1"><button type="button" class="btn sm" id="addp">إضافة</button></div>
      </div>
      <div class="card" style="position:sticky;top:0"><h3>🧪 اختبار الاتصال</h3>
        <label class="f"><span>الاستعلام</span><select id="tw"><option value="order">حالة الطلب</option><option value="customer">بيانات المستفيد</option></select></label>
        <div id="tparams"></div>
        <button type="button" class="btn" id="tbtn">تشغيل الاختبار</button>
        <pre class="code" id="tres" style="margin-top:12px;min-height:80px;white-space:pre-wrap"></pre>
        ${d.type === 'demo' ? '<p class="muted" style="font-size:12.5px">بيانات تجريبية: طلب <code>1001</code> بجوال <code>0500000001</code>، طلب <code>1002</code> بجوال <code>0500000002</code></p>' : ''}
      </div>
      <div style="grid-column:1/-1"><button class="btn pri">💾 حفظ</button></div></form>`;
    const f = $('#df');
    f.type.value = d.type;
    const sync = () => { $('#dbf').classList.toggle('hidden', !['mysql', 'postgres'].includes(f.type.value)); $('#apif').classList.toggle('hidden', f.type.value !== 'api'); drawParams(); };
    const names = (q) => [...new Set([...q.matchAll(/(?<![:\w]):([a-zA-Z_]\w*)/g), ...q.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
    const drawParams = () => {
      const q = $('#tw').value === 'order' ? f.order_query.value : f.customer_query.value;
      $('#tparams').innerHTML = names(q).map(n => `<label class="f"><span>${esc(n)}</span><input data-tp="${esc(n)}" dir="ltr"></label>`).join('');
    };
    f.type.onchange = sync; $('#tw').onchange = drawParams; f.order_query.oninput = drawParams; f.customer_query.oninput = drawParams;
    sync();
    const collect = () => {
      const pp = {}; $$('[data-pp]').forEach(i => pp[i.dataset.pp] = i.value);
      const o = { type: f.type.value, api_url: f.api_url.value, api_headers: f.api_headers.value, order_query: f.order_query.value, customer_query: f.customer_query.value,
        order_template: f.order_template.value, notes_template: f.notes_template.value, customer_template: f.customer_template.value, not_found: f.not_found.value, error_message: f.error_message.value, param_prompts: pp };
      if (f.connection.value !== '••••••') o.connection = f.connection.value;
      return o;
    };
    $('#addp').onclick = () => { const n = $('#newp').value.trim().replace(/\W/g, ''); if (!n) return; d.param_prompts[n] = 'من فضلك أرسل ' + n; site().settings.datasource = { ...d, ...collect(), param_prompts: { ...collect().param_prompts, [n]: 'من فضلك أرسل ' + n } }; renderDatasource(); };
    $('#tbtn').onclick = async () => {
      const params = {}; $$('[data-tp]').forEach(i => params[i.dataset.tp] = i.value);
      $('#tres').textContent = '...';
      try { const r = await api('POST', `/api/sites/${site().id}/datasource/test`, { datasource: collect(), which: $('#tw').value, params }); $('#tres').textContent = '✅ نجح الاتصال\n' + JSON.stringify(r.rows, null, 2); }
      catch (e) { $('#tres').textContent = '❌ ' + e.message; }
    };
    f.onsubmit = (e) => { e.preventDefault(); saveSite({ settings: { datasource: collect() } }); };
  }

  /* ============================ appearance ============================ */
  function readImage(file, size = 256) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); const s = Math.min(size, Math.max(img.width, img.height));
          const r = s / Math.max(img.width, img.height); c.width = img.width * r; c.height = img.height * r;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL(file.type === 'image/png' || file.type === 'image/svg+xml' ? 'image/png' : 'image/jpeg', .9));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function renderAppearance() {
    setTitle('المظهر والنصوص');
    const a = site().settings.appearance, p = site().settings.prechat;
    const sw = ['#41b072', '#16a34a', '#0ea5e9', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#0f172a'];
    const img = (name, label, val) => `<label class="f"><span>${label}</span><div class="row"><div class="imgprev" id="pv_${name}">${val ? `<img src="${esc(val)}">` : '<span class="muted" style="font-size:11px">افتراضي</span>'}</div>
      <input type="file" accept="image/*" data-img="${name}" style="flex:1"><button type="button" class="btn sm" data-clr="${name}">إزالة</button></div>
      <input name="${name}" value="${esc(val && !val.startsWith('data:') ? val : '')}" placeholder="أو ضع رابط صورة https://..." dir="ltr" style="margin-top:6px"></label>`;
    $('#ct').innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) 420px;align-items:start">
      <form id="af">
        <div class="card" style="margin-bottom:16px"><h3>🎨 الألوان والأيقونة</h3>
          <label class="f"><span>اللون الرئيسي</span><div class="colorrow"><input type="color" name="primary_color" value="${esc(a.primary_color)}"><input name="primary_color_t" value="${esc(a.primary_color)}" dir="ltr" style="width:120px"></div>
            <div class="swatches">${sw.map(c => `<button type="button" style="background:${c}" data-sw="${c}"></button>`).join('')}</div></label>
          ${img('launcher_icon', 'صورة زر المحادثة (أسفل الصفحة)', a.launcher_icon)}
          ${img('bot_avatar', 'صورة البوت / الشعار', a.bot_avatar)}
          <div class="grid g3">
            <label class="f"><span>الموضع</span><select name="position"><option value="right">يمين</option><option value="left">يسار</option></select></label>
            <label class="f"><span>بُعد أفقي (px)</span><input type="number" name="offset_x" value="${a.offset_x}"></label>
            <label class="f"><span>بُعد من الأسفل (px)</span><input type="number" name="offset_y" value="${a.offset_y}"></label>
            <label class="f"><span>حجم الزر (px)</span><input type="number" name="launcher_size" value="${a.launcher_size}" min="44" max="96"></label>
            <label class="f"><span>اتجاه النص</span><select name="dir"><option value="rtl">عربي (RTL)</option><option value="ltr">English (LTR)</option></select></label>
            <label class="f"><span>الخط (اختياري)</span><input name="font" value="${esc(a.font)}" placeholder="Tajawal"></label>
          </div>
          <label class="chk"><input type="checkbox" name="hide_on_mobile" ${a.hide_on_mobile ? 'checked' : ''}> إخفاء على الجوال</label>
        </div>
        <div class="card" style="margin-bottom:16px"><h3>✍️ النصوص</h3>
          <div class="grid g2">
            <label class="f"><span>عنوان النافذة</span><input name="title" value="${esc(a.title)}"></label>
            <label class="f"><span>العنوان الفرعي</span><input name="subtitle" value="${esc(a.subtitle)}"></label>
            <label class="f"><span>اسم البوت</span><input name="bot_name" value="${esc(a.bot_name)}"></label>
            <label class="f"><span>نص بجانب الزر (اختياري)</span><input name="launcher_label" value="${esc(a.launcher_label)}" placeholder="تحدث معنا"></label>
            <label class="f"><span>رسالة ترحيب منبثقة</span><input name="teaser" value="${esc(a.teaser)}"></label>
            <label class="f"><span>تظهر بعد (ثانية)</span><input type="number" name="teaser_delay" value="${a.teaser_delay}"></label>
            <label class="f"><span>نص حقل الكتابة</span><input name="placeholder" value="${esc(a.placeholder)}"></label>
            <label class="f"><span>زر البدء</span><input name="start_label" value="${esc(a.start_label)}"></label>
            <label class="f"><span>زر إنهاء المحادثة</span><input name="end_label" value="${esc(a.end_label)}"></label>
            <label class="f"><span>زر محادثة جديدة</span><input name="new_chat_label" value="${esc(a.new_chat_label)}"></label>
          </div>
          <p class="muted" style="font-size:13px;margin:0">رسالة الترحيب داخل المحادثة تُعدّل من <a href="#/tree">شجرة الردود</a> (العقدة "البداية").</p>
        </div>
        <div class="card" style="margin-bottom:16px"><h3>⭐ التقييم</h3>
          <div class="grid g2">
            <label class="f"><span>عدد النجوم</span><input type="number" name="rating_max" min="3" max="10" value="${a.rating_max}"><small>يدعم أنصاف النجوم. اللون يتدرج من الأحمر (نصف نجمة) إلى الأخضر (الحد الأعلى).</small></label>
            <label class="f"><span>عنوان التقييم</span><input name="rating_title" value="${esc(a.rating_title)}"></label>
            <label class="f"><span>حقل الملاحظات</span><input name="rating_comment_placeholder" value="${esc(a.rating_comment_placeholder)}"></label>
            <label class="f"><span>رسالة الشكر</span><input name="rating_thanks" value="${esc(a.rating_thanks)}"></label>
          </div>
          <div id="rdemo" style="padding:10px;background:var(--soft);border-radius:10px"></div>
        </div>
        <div class="card" style="margin-bottom:16px"><h3>📝 نموذج ما قبل المحادثة</h3>
          <label class="chk"><input type="checkbox" name="p_enabled" ${p.enabled ? 'checked' : ''}> طلب بيانات المستفيد قبل البدء</label>
          <label class="f"><span>عنوان النموذج</span><input name="p_title" value="${esc(p.title)}"></label>
          <div class="row"><label class="chk"><input type="checkbox" name="p_name" ${p.name ? 'checked' : ''}> الاسم</label><label class="chk"><input type="checkbox" name="p_phone" ${p.phone ? 'checked' : ''}> الجوال</label><label class="chk"><input type="checkbox" name="p_email" ${p.email ? 'checked' : ''}> البريد</label></div>
          <small class="muted">الجوال يُستخدم لجلب بيانات المستفيد من قاعدة البيانات تلقائياً.</small>
        </div>
        <button class="btn pri">💾 حفظ وتحديث المعاينة</button>
      </form>
      <div class="card" style="position:sticky;top:0;padding:10px"><div class="row" style="padding:4px 6px 10px"><b>معاينة حية</b><span class="sp"></span><button class="btn sm" id="rl">↻</button></div>
        <iframe class="preview-frame" id="pf"></iframe></div>
    </div>`;
    const f = $('#af');
    f.position.value = a.position; f.dir.value = a.dir;
    const imgs = { launcher_icon: a.launcher_icon, bot_avatar: a.bot_avatar };
    const loadPrev = () => { $('#pf').src = `/demo/preview.html?site=${encodeURIComponent(site().key)}&t=${Date.now()}`; };
    loadPrev(); $('#rl').onclick = loadPrev;
    f.primary_color.oninput = () => (f.primary_color_t.value = f.primary_color.value);
    f.primary_color_t.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(f.primary_color_t.value)) f.primary_color.value = f.primary_color_t.value; };
    $$('[data-sw]').forEach(b => b.onclick = () => { f.primary_color.value = f.primary_color_t.value = b.dataset.sw; });
    $$('[data-img]').forEach(inp => inp.onchange = async () => {
      if (!inp.files[0]) return;
      const d = await readImage(inp.files[0]); imgs[inp.dataset.img] = d; f[inp.dataset.img].value = '';
      $('#pv_' + inp.dataset.img).innerHTML = `<img src="${d}">`;
    });
    $$('[data-clr]').forEach(b => b.onclick = () => { imgs[b.dataset.clr] = ''; f[b.dataset.clr].value = ''; $('#pv_' + b.dataset.clr).innerHTML = '<span class="muted" style="font-size:11px">افتراضي</span>'; });
    const rdemo = () => {
      const m = Number(f.rating_max.value) || 5;
      $('#rdemo').innerHTML = [0.5, m / 2, m - 1, m].map(v => `<div style="margin:4px 0">${stars(v, m)}</div>`).join('');
    };
    f.rating_max.oninput = rdemo; rdemo();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = (n) => f[n].value;
      const icon = (n) => f[n].value.trim() || imgs[n] || '';
      await saveSite({ settings: {
        appearance: { primary_color: v('primary_color'), launcher_icon: icon('launcher_icon'), bot_avatar: icon('bot_avatar'), position: v('position'),
          offset_x: Number(v('offset_x')), offset_y: Number(v('offset_y')), launcher_size: Number(v('launcher_size')), dir: v('dir'), font: v('font'), hide_on_mobile: f.hide_on_mobile.checked,
          title: v('title'), subtitle: v('subtitle'), bot_name: v('bot_name'), launcher_label: v('launcher_label'), teaser: v('teaser'), teaser_delay: Number(v('teaser_delay')),
          placeholder: v('placeholder'), start_label: v('start_label'), end_label: v('end_label'), new_chat_label: v('new_chat_label'),
          rating_max: Number(v('rating_max')), rating_title: v('rating_title'), rating_comment_placeholder: v('rating_comment_placeholder'), rating_thanks: v('rating_thanks') },
        prechat: { enabled: f.p_enabled.checked, title: v('p_title'), name: f.p_name.checked, phone: f.p_phone.checked, email: f.p_email.checked }
      } });
      loadPrev();
    };
  }

  /* ============================ install ============================ */
  function renderInstall() {
    setTitle('التركيب على المواقع');
    const s = site(), origin = location.origin;
    const snippet = `<script src="${origin}/widget.js" data-site="${s.key}" async></script>`;
    $('#ct').innerHTML = `<div class="grid g2" style="align-items:start">
      <div class="card"><h3>🌐 أي موقع (HTML، سلة، زد، Shopify، Wix...)</h3>
        <p class="muted">انسخ السطر التالي والصقه قبل <code>&lt;/body&gt;</code> في قالب موقعك:</p>
        <pre class="code" id="snip">${esc(snippet)}</pre><button class="btn" style="margin-top:8px" data-copy="#snip">📋 نسخ</button>
        <h3 style="margin-top:22px">⚙️ أوامر JavaScript</h3>
        <pre class="code">SmartChat.open();   // فتح المحادثة
SmartChat.close();  // إغلاق النافذة
SmartChat.toggle();</pre>
        <p class="muted" style="font-size:13px">مثال: <code>&lt;a href="#" onclick="SmartChat.open()"&gt;تواصل معنا&lt;/a&gt;</code></p>
        <h3 style="margin-top:22px">🔐 توثيق هوية المستخدم المسجّل (اختياري)</h3>
        <p class="muted" style="font-size:13px">ليتعرف البوت على العميل المسجّل دخوله ويجلب بياناته وطلباته بأمان، عرّف هذا قبل سطر التركيب (يُحسب التوقيع في الخادم):</p>
        <pre class="code">&lt;script&gt;
window.SmartChatUser = {
  name: "اسم العميل",
  email: "user@mail.com",
  sig: "HMAC_SHA256(email, IDENTITY_SECRET)"
};
&lt;/script&gt;</pre>
        ${can('admin') ? `<label class="f" style="margin-top:12px"><span>IDENTITY_SECRET</span><div class="row"><input id="isec" value="${esc(s.settings.security.identity_secret)}" readonly dir="ltr" style="flex:1"><button class="btn sm" data-copy="#isec">نسخ</button><button class="btn sm dan" id="regen">تجديد</button></div></label>` : ''}
        <pre class="code" style="margin-top:8px">// PHP
hash_hmac('sha256', strtolower($email), IDENTITY_SECRET);
// Node.js
crypto.createHmac('sha256', SECRET).update(email.toLowerCase()).digest('hex');</pre>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px"><h3>🟦 ووردبريس / ووكومرس</h3>
          <ol style="line-height:2;padding-inline-start:20px;margin:0">
            <li>حمّل إضافة <b>smart-chat-agent.zip</b> المرفقة مع المشروع.</li>
            <li>من لوحة ووردبريس: <b>إضافات ← أضف جديد ← رفع إضافة</b> ثم فعّلها.</li>
            <li>اذهب إلى <b>الإعدادات ← Smart Chat</b> وأدخل:</li>
          </ol>
          <div class="kv" style="margin:10px 0"><span>رابط الخادم</span><b><code>${esc(origin)}</code></b><span>مفتاح الموقع</span><b><code id="skey">${esc(s.key)}</code></b>
          ${can('admin') ? `<span>المفتاح السري</span><b><code style="font-size:11px">${esc(s.settings.security.identity_secret)}</code></b>` : ''}</div>
          <p class="muted" style="font-size:13px">الإضافة توثّق هوية العملاء المسجلين تلقائياً. ولربط طلبات ووكومرس، اختر MySQL في <a href="#/datasource">ربط قاعدة البيانات</a> واستخدم قاعدة بيانات ووردبريس.</p>
          <details><summary style="cursor:pointer">مثال استعلام ووكومرس (HPOS)</summary><pre class="code" style="margin-top:8px">SELECT REPLACE(o.status,'wc-','') AS status,
  o.billing_email AS email, o.customer_note AS notes
FROM wp_wc_orders o
JOIN wp_wc_order_addresses a ON a.order_id=o.id AND a.address_type='billing'
WHERE o.id = :order_no AND a.phone = :phone</pre></details>
        </div>
        <div class="card"><h3>🔒 النطاقات المسموح لها</h3>
          ${can('admin') ? `<label class="f"><span>اترك فارغاً للسماح للجميع</span><input id="dom" value="${esc(s.settings.security.allowed_domains)}" placeholder="example.com, shop.example.com" dir="ltr"></label><button class="btn pri" id="sdom">حفظ</button>` : `<p>${esc(s.settings.security.allowed_domains || 'الكل')}</p>`}
          <p style="margin-top:16px"><a class="btn" href="/demo/preview.html?site=${encodeURIComponent(s.key)}" target="_blank">🧪 فتح صفحة تجربة</a></p>
        </div>
      </div></div>`;
    $$('[data-copy]').forEach(b => b.onclick = () => { const el = $(b.dataset.copy); navigator.clipboard.writeText(el.value || el.textContent); ok('تم النسخ'); });
    $('#sdom')?.addEventListener('click', () => saveSite({ settings: { security: { allowed_domains: $('#dom').value } } }));
    $('#regen')?.addEventListener('click', async () => {
      if (!confirm('تجديد المفتاح سيبطل التوقيعات الحالية. يجب تحديثه في ووردبريس. متابعة؟')) return;
      const r = await api('POST', `/api/sites/${s.id}/regenerate-secret`); s.settings.security.identity_secret = r.identity_secret; renderInstall();
    });
  }

  /* ============================ users ============================ */
  async function renderUsers() {
    setTitle('المستخدمون والصلاحيات');
    S.users = await api('GET', '/api/users');
    $('#ct').innerHTML = `
      <div class="card" style="margin-bottom:16px"><div class="row"><b>${S.users.length} مستخدم</b><span class="sp"></span><button class="btn pri" id="nu">+ مستخدم جديد</button></div></div>
      <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>الاسم</th><th>البريد</th><th>الصلاحية</th><th>الحالة</th><th>آخر ظهور</th><th></th></tr></thead><tbody>
      ${S.users.map(u => `<tr data-id="${u.id}"><td><b>${esc(u.name)}</b> ${S.online.some(o => o.id === u.id) ? '🟢' : ''}</td><td>${esc(u.email)}</td><td><span class="tag">${ROLES[u.role]}</span></td>
        <td>${u.active ? '<span class="tag human">مفعّل</span>' : '<span class="tag closed">معطّل</span>'}</td><td><small>${u.last_seen ? fmtDate(u.last_seen) : '-'}</small></td>
        <td style="white-space:nowrap"><button class="btn sm" data-ed>تعديل</button>${u.id !== S.user.id ? '<button class="btn sm dan" data-rm>حذف</button>' : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="card" style="margin-top:16px"><h3>الصلاحيات</h3>
        <table><tr><th></th><th>موظف</th><th>مشرف</th><th>مدير</th></tr>
        ${[['الرد على المحادثات واستلامها وتحويلها', 1, 1, 1], ['عرض سجل المحادثات والإحصائيات', 1, 1, 1], ['إضافة وتعديل قاعدة المعرفة', 1, 1, 1], ['حذف من قاعدة المعرفة وحذف المحادثات', 0, 1, 1],
        ['تعديل شجرة الردود وسلوك البوت والمظهر', 0, 1, 1], ['ربط قاعدة البيانات والمفاتيح الأمنية', 0, 0, 1], ['إدارة المستخدمين والمواقع وسجل العمليات', 0, 0, 1]]
        .map(r => `<tr><td>${r[0]}</td>${r.slice(1).map(x => `<td>${x ? '✅' : '—'}</td>`).join('')}</tr>`).join('')}</table></div>`;
    $('#nu').onclick = () => userModal();
    $$('tr[data-id]').forEach(tr => {
      const u = S.users.find(x => x.id === Number(tr.dataset.id));
      $('[data-ed]', tr).onclick = () => userModal(u);
      $('[data-rm]', tr)?.addEventListener('click', async () => { if (confirm('حذف المستخدم ' + u.name + '؟')) { await api('DELETE', '/api/users/' + u.id).catch(err); renderUsers(); } });
    });
  }
  function userModal(u = {}) {
    modal(`<h3>${u.id ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3>
      <label class="f"><span>الاسم</span><input id="un" value="${esc(u.name || '')}"></label>
      <label class="f"><span>البريد الإلكتروني (للدخول)</span><input id="ue" type="email" value="${esc(u.email || '')}" dir="ltr"></label>
      <label class="f"><span>كلمة المرور ${u.id ? '(اتركها فارغة لعدم التغيير)' : ''}</span><input id="up" type="password" autocomplete="new-password"></label>
      <label class="f"><span>الصلاحية</span><select id="ur"><option value="agent">موظف خدمة عملاء</option><option value="supervisor">مشرف</option><option value="admin">مدير</option></select></label>
      ${u.id ? `<label class="chk"><input type="checkbox" id="ua" ${u.active ? 'checked' : ''}> الحساب مفعّل</label>` : ''}
      <div class="row"><button class="btn pri" id="us">حفظ</button><button class="btn" data-close>إلغاء</button></div>`, (m, close) => {
      $('#ur', m).value = u.role || 'agent';
      $('#us', m).onclick = async () => {
        const body = { name: $('#un', m).value, email: $('#ue', m).value, role: $('#ur', m).value };
        if ($('#up', m).value) body.password = $('#up', m).value;
        if (u.id) body.active = $('#ua', m).checked;
        try { u.id ? await api('PUT', '/api/users/' + u.id, body) : await api('POST', '/api/users', body); ok('تم الحفظ'); close(); renderUsers(); } catch (e) { err(e); }
      };
    });
  }

  /* ============================ sites ============================ */
  function renderSites() {
    setTitle('المواقع');
    $('#ct').innerHTML = `<div class="card" style="margin-bottom:16px"><div class="row"><span class="muted">كل موقع له مفتاح وإعدادات وشجرة وقاعدة معرفة مستقلة. جميع المحادثات تصل للوحة نفسها.</span><span class="sp"></span><button class="btn pri" id="ns">+ موقع جديد</button></div></div>
      <div class="card" style="padding:0"><table><thead><tr><th>الاسم</th><th>المفتاح</th><th>تاريخ الإنشاء</th><th></th></tr></thead><tbody>
      ${S.sites.map(s => `<tr data-id="${s.id}"><td><input value="${esc(s.name)}" data-name style="max-width:260px"></td><td><code>${esc(s.key)}</code></td><td>${fmtDate(s.created_at)}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-sv>حفظ الاسم</button><button class="btn sm" data-use>إدارة</button>${S.sites.length > 1 ? '<button class="btn sm dan" data-rm>حذف</button>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
    $('#ns').onclick = async () => { const n = prompt('اسم الموقع'); if (!n) return; const s = await api('POST', '/api/sites', { name: n }); S.sites.push(s); S.siteId = s.id; localStorage.setItem('sc_site', s.id); renderShell(); location.hash = '#/install'; route(); };
    $$('tr[data-id]').forEach(tr => {
      const id = Number(tr.dataset.id);
      $('[data-sv]', tr).onclick = async () => { const s = await api('PUT', '/api/sites/' + id, { name: $('[data-name]', tr).value }); S.sites[S.sites.findIndex(x => x.id === id)] = s; ok('تم'); renderShell(); route(); };
      $('[data-use]', tr).onclick = () => { S.siteId = id; localStorage.setItem('sc_site', id); renderShell(); location.hash = '#/appearance'; };
      $('[data-rm]', tr)?.addEventListener('click', async () => { if (prompt('سيُحذف الموقع وجميع محادثاته نهائياً. اكتب "حذف" للتأكيد') !== 'حذف') return; await api('DELETE', '/api/sites/' + id); S.sites = S.sites.filter(s => s.id !== id); S.siteId = S.sites[0].id; renderShell(); route(); });
    });
  }

  /* ============================ audit & profile ============================ */
  async function renderAudit() {
    setTitle('سجل العمليات');
    const rows = await api('GET', '/api/audit');
    $('#ct').innerHTML = `<div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><small>${fmtDate(r.created_at)}</small></td><td>${esc(r.user_name || '-')}</td><td><code>${esc(r.action)}</code></td><td class="mono" style="font-size:12px">${esc(r.details)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderProfile() {
    setTitle('حسابي');
    $('#ct').innerHTML = `<form class="card" id="pf" style="max-width:480px"><h3>بياناتي</h3>
      <label class="f"><span>الاسم</span><input name="name" value="${esc(S.user.name)}"></label>
      <label class="f"><span>البريد</span><input value="${esc(S.user.email)}" disabled dir="ltr"></label>
      <h3 style="margin-top:20px">تغيير كلمة المرور</h3>
      <label class="f"><span>كلمة المرور الحالية</span><input type="password" name="current_password"></label>
      <label class="f"><span>كلمة المرور الجديدة</span><input type="password" name="password" autocomplete="new-password"></label>
      <button class="btn pri">حفظ</button>
      <h3 style="margin-top:20px">التنبيهات</h3><button type="button" class="btn" id="np">🔔 تفعيل تنبيهات المتصفح</button></form>`;
    $('#np').onclick = () => Notification.requestPermission().then(p => ok(p === 'granted' ? 'تم التفعيل' : 'لم يتم السماح'));
    $('#pf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { await api('PUT', '/api/me', { name: f.name.value, password: f.password.value || undefined, current_password: f.current_password.value }); S.user.name = f.name.value; if (f.password.value) { S.user.weak_password = false; } ok('تم الحفظ'); if (f.password.value) { renderShell(); route(); return; } f.password.value = f.current_password.value = ''; } catch (x) { err(x); }
    };
  }

  boot();
})();
