/* Smart Chat — admin dashboard (vanilla JS SPA) */
(function () {
  'use strict';
  const THEME_KEY = 'sc_theme';
  const DASHBOARD_KEY = 'sc_dashboard_customization';
  document.body.dataset.theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  const DASHBOARD_DEFAULTS = {
    accent: '#41b072', font: '"IBM Plex Sans Arabic",system-ui,Tahoma,sans-serif', decoration: 'none',
    light: { bg: '#f4f6f8', panel: '#ffffff', text: '#0f172a', sidebar: '#0f1f17', sidebarText: '#cfe3d7' },
    dark: { bg: '#0b1220', panel: '#111827', text: '#e5e7eb', sidebar: '#080f0c', sidebarText: '#cfe3d7' }
  };
  function loadDashboardPrefs() {
    try { return { ...DASHBOARD_DEFAULTS, ...JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}'),
      light: { ...DASHBOARD_DEFAULTS.light, ...(JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}').light || {}) },
      dark: { ...DASHBOARD_DEFAULTS.dark, ...(JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}').dark || {}) } }; }
    catch { return JSON.parse(JSON.stringify(DASHBOARD_DEFAULTS)); }
  }
  let dashboardPrefs = loadDashboardPrefs();
  function applyDashboardPrefs(prefs = dashboardPrefs) {
    const mode = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
    const colors = prefs[mode] || DASHBOARD_DEFAULTS[mode];
    document.body.style.setProperty('--bg', colors.bg);
    document.body.style.setProperty('--panel', colors.panel);
    document.body.style.setProperty('--ink', colors.text);
    document.body.style.setProperty('--side-bg', colors.sidebar);
    document.body.style.setProperty('--side-ink', colors.sidebarText);
    document.body.style.setProperty('--brand', prefs.accent || DASHBOARD_DEFAULTS.accent);
    document.body.style.setProperty('--brand-soft', (prefs.accent || DASHBOARD_DEFAULTS.accent) + '20');
    document.body.style.fontFamily = prefs.font || DASHBOARD_DEFAULTS.font;
    document.body.dataset.dashboardDecoration = prefs.decoration || 'none';
    const motifs = {
      geometric: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><path d="M36 3 43 22 63 16 50 36 63 56 43 50 36 69 29 50 9 56 22 36 9 16 29 22Z" fill="none" stroke="#ffffff" stroke-opacity=".17"/><circle cx="36" cy="36" r="10" fill="none" stroke="#ffffff" stroke-opacity=".14"/></svg>',
      arabesque: '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88"><path d="M44 4C18 4 4 18 4 44s14 40 40 40 40-14 40-40S70 4 44 4Zm0 12c15 0 28 13 28 28S59 72 44 72 16 59 16 44s13-28 28-28Z" fill="none" stroke="#ffffff" stroke-opacity=".17"/><path d="M44 17c-5 12-12 19-24 27 12 8 19 15 24 27 5-12 12-19 24-27-12-8-19-15-24-27Z" fill="none" stroke="#ffffff" stroke-opacity=".14"/></svg>',
      arabic_letters: '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="88" viewBox="0 0 112 88"><g fill="#ffffff" fill-opacity=".18" font-family="serif" font-size="31" text-anchor="middle"><text x="28" y="53">ع</text><text x="56" y="53">ض</text><text x="84" y="53">م</text></g></svg>'
    };
    const motifColor = mode === 'dark' ? '#ffffff' : (prefs.accent || DASHBOARD_DEFAULTS.accent);
    const svg = motifs[prefs.decoration]?.replace(/#ffffff/g, motifColor);
    document.body.style.setProperty('--dashboard-pattern', svg ? 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")' : 'none');
  }
  applyDashboardPrefs();
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
  const ACTIONS = { goto: 'الانتقال إلى عقدة', answer: 'رد نصي مباشر', company_info: 'معلومات النشاط التجاري', company_website: 'فتح موقع النشاط التجاري', company_location: 'موقع النشاط التجاري على خرائط Google', order_status: 'استعلام حالة طلب (قاعدة البيانات)', customer_info: 'عرض بيانات المستفيد', handoff: 'تحويل لموظف بشري', url: 'فتح رابط', end: 'إنهاء المحادثة' };
  const ACTION_HELP = {
    goto: 'ينقل العميل إلى عقدة أخرى لعرض رسالة وأزرار جديدة.', answer: 'يرسل ردًا مكتوبًا مباشرة ثم يعرض خيارات المتابعة.',
    company_info: 'يعرض بيانات النشاط التجاري التي أدخلتها في الهوية والمظهر.', company_website: 'يفتح رابط موقع النشاط التجاري المحفوظ في الهوية والمظهر.', company_location: 'يرسل عنوان النشاط ورابط فتحه على خرائط Google.',
    order_status: 'يطلب بيانات العميل ثم يبحث عن الطلب في مصدر البيانات المرتبط.', customer_info: 'يبحث عن بيانات العميل في مصدر البيانات المرتبط.',
    handoff: 'ينقل المحادثة إلى صندوق الموظفين المباشر.', url: 'يفتح الرابط الذي تضيفه في حقل هذا الزر.', end: 'ينهي المحادثة ويعرض نموذج التقييم.'
  };
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
    ['appearance', '🎨', 'الهوية والمظهر', 'supervisor'],
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
        <div class="top"><button class="btn sm menu-btn" id="mb" aria-label="فتح القائمة">☰</button><h2 id="ttl"></h2>
          <button class="btn sm" id="theme-toggle" type="button" aria-label="تبديل الوضع">${document.body.dataset.theme === 'dark' ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي'}</button>
          <label class="active-site" for="sitesel"><span>🌐 الموقع النشط<small>إعدادات ومحادثات هذا الموقع</small></span><select id="sitesel" title="اختر الموقع الذي تريد إدارة إعداداته ومحادثاته">${S.sites.map(s => `<option value="${s.id}" ${s.id === S.siteId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        </div>
        ${S.user.weak_password ? '<div style="background:#fef2f2;color:#991b1b;padding:10px 20px;border-bottom:1px solid #fecaca;font-size:14px">⚠️ أنت تستخدم كلمة المرور الافتراضية. <a href="#/profile" style="color:#991b1b;font-weight:700">غيّرها الآن</a> لحماية لوحة التحكم.</div>' : ''}
        <div class="content" id="ct"></div>
      </div>
    </div>`;
    $('#lo').onclick = (e) => { e.preventDefault(); logout(); };
    $('#mb').onclick = () => $('#side').classList.toggle('open');
    $('#theme-toggle').onclick = () => {
      const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme);
      applyDashboardPrefs();
      $('#theme-toggle').textContent = theme === 'dark' ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي';
    };
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
  /* ============================ flow editor (drag & drop) ============================ */
  const ACT_META = {
    goto: { icon: '←', color: '#64748b', label: 'انتقال' },
    answer: { icon: '💬', color: '#0ea5e9', label: 'رد نصي' },
    order_status: { icon: '📦', color: '#2563eb', label: 'حالة طلب' },
    customer_info: { icon: '👤', color: '#7c3aed', label: 'بيانات المستفيد' },
    company_info: { icon: '🏢', color: '#0f766e', label: 'معلومات النشاط' },
    company_location: { icon: '📍', color: '#059669', label: 'موقع النشاط' }, company_website: { icon: '🌐', color: '#2563eb', label: 'موقع النشاط' },
    handoff: { icon: '🙋', color: '#ea580c', label: 'تحويل لموظف' },
    url: { icon: '🔗', color: '#0891b2', label: 'رابط' },
    end: { icon: '⏹', color: '#dc2626', label: 'إنهاء' }
  };

  function autoLayout(tree) {
    const depth = {}, order = [];
    const q = [[tree.root, 0]];
    while (q.length) {
      const [id, d] = q.shift();
      if (id in depth) continue;
      depth[id] = d; order.push(id);
      const n = tree.nodes.find(x => x.id === id);
      (n?.options || []).forEach(o => { if (o.action === 'goto' && o.target && !(o.target in depth)) q.push([o.target, d + 1]); });
    }
    tree.nodes.forEach(n => { if (!(n.id in depth)) { depth[n.id] = 0; order.push(n.id); } });
    const rows = {};
    order.forEach(id => {
      const d = depth[id]; rows[d] = (rows[d] || 0);
      const n = tree.nodes.find(x => x.id === id);
      n.x = 2000 - d * 360; n.y = 60 + rows[d];
      rows[d] += Math.max(260, 180 + (n.options || []).length * 48);
    });
  }

  function renderTree() {
    setTitle('شجرة الردود', true);
    const tree = JSON.parse(JSON.stringify(site().tree));
    // Existing flows may have accidentally promoted a branch to the start.
    // Prefer the canonical greeting node so location/info branches stay in
    // the menu and the visitor always sees the welcome first.
    if (tree.nodes.some(n => n.id === 'root')) tree.root = 'root';
    if (tree.nodes.some(n => typeof n.x !== 'number')) autoLayout(tree);
    const view = { x: 0, y: 0, z: 1 };
    let sel = null, dirty = false, drag = null;

    $('#ct').innerHTML = `
      <div class="fe">
        <div class="fe-bar">
          <button class="btn pri fe-tool" id="fe-add" title="إضافة خطوة جديدة في مسار المحادثة">＋ إضافة عقدة</button>
          <button class="btn fe-tool" id="fe-layout" title="ترتيب العقد تلقائياً حسب مسار الردود">⇄ ترتيب تلقائي</button>
          <button class="btn fe-tool" id="fe-fit" title="إظهار الشجرة كاملة داخل مساحة العمل">⤢ ملائمة الشجرة</button>
          <button class="btn fe-tool zoom-tool" id="fe-zo" title="تصغير">− تصغير</button><span class="muted" id="fe-z" style="min-width:48px;text-align:center">100%</span><button class="btn fe-tool zoom-tool" id="fe-zi" title="تكبير">＋ تكبير</button>
          <span class="sp"></span><span class="muted" id="fe-dirty" style="font-size:13px"></span>
          <button class="btn fe-tool" id="fe-reset" title="إرجاع الشجرة إلى الردود الافتراضية">↺ استعادة الافتراضي</button>
          <button class="btn pri fe-tool" id="fe-save" title="حفظ كل تغييرات الشجرة للموقع النشط">💾 حفظ التغييرات</button>
        </div>
        <div class="fe-main">
          <div class="fe-canvas" id="fe-canvas" dir="ltr">
            <div class="fe-world" id="fe-world"><svg class="fe-edges" id="fe-edges"></svg></div>
          <div class="fe-hint"><b>الربط:</b> اختر «الانتقال إلى عقدة» للزر، ثم اسحب دائرته وأسقطها على دائرة المدخل أعلى العقدة المناسبة. لن يتم الربط عند الإفلات في مكان آخر. لفك الربط اضغط الخط الواصل وأكّد الفك. يمكنك أيضًا اختيار العقدة من القائمة الجانبية.</div>
          </div>
          <aside class="fe-side" id="fe-side"></aside>
        </div>
      </div>`;
    const canvas = $('#fe-canvas'), world = $('#fe-world'), svg = $('#fe-edges');
    const setDirty = () => { dirty = true; $('#fe-dirty').textContent = '● تغييرات غير محفوظة'; };
    const applyView = () => { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`; $('#fe-z').textContent = Math.round(view.z * 100) + '%'; };
    const nodeById = (id) => tree.nodes.find(n => n.id === id);

    function cardHTML(n) {
      const isRoot = n.id === tree.root;
      return `<div class="fe-card ${isRoot ? 'root' : ''} ${sel === n.id ? 'sel' : ''}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px" dir="rtl">
        <span class="fe-in" title="أسقط هنا لربط زر بهذه العقدة"></span>
        <div class="fe-head">${isRoot ? '<span class="fe-start">▶ البداية</span>' : ''}<b>${esc(n.title || n.id)}</b></div>
        <div class="fe-msg">${esc(n.message || '').slice(0, 120) || '<span class="muted">بدون رسالة</span>'}</div>
        <div class="fe-opts">${(n.options || []).map((o, i) => {
          const m = ACT_META[o.action] || ACT_META.goto;
          const tgt = o.action === 'goto' ? nodeById(o.target) : null;
          return `<div class="fe-opt" data-i="${i}"><span class="fe-ic" style="background:${m.color}">${m.icon}</span><span class="fe-ol">${esc(o.label)}</span>
            ${o.action !== 'goto' ? `<span class="fe-tag" style="color:${m.color}">${m.label}</span>` : (tgt ? '' : '<span class="fe-tag" style="color:#dc2626">غير مربوط</span>')}
            ${o.action === 'goto' ? `<span class="fe-port" data-port="${i}" title="اسحب إلى دائرة مدخل العقدة لربط هذا الزر"></span>` : ''}</div>`;
        }).join('')}
        <button class="fe-addopt" type="button">＋ زر</button></div>
      </div>`;
    }

    function drawCards() {
      $$('.fe-card', world).forEach(c => c.remove());
      world.insertAdjacentHTML('beforeend', tree.nodes.map(cardHTML).join(''));
      $$('.fe-card', world).forEach(bindCard);
      drawEdges();
    }

    function portPos(card, i) {
      const p = $(`.fe-port[data-port="${i}"]`, card);
      const n = nodeById(card.dataset.id);
      let el = p, x = 0, y = 0;
      while (el && el !== card) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      return { x: n.x + x + p.offsetWidth / 2, y: n.y + y + p.offsetHeight / 2 };
    }
    const inPos = (n) => ({ x: n.x + 280, y: n.y + 22 });
    const curve = (a, b) => {
      const dx = Math.max(70, Math.abs(b.x - a.x) * 0.45);
      return `M${a.x},${a.y} C${a.x - dx},${a.y} ${b.x + dx},${b.y} ${b.x},${b.y}`;
    };

    function drawEdges(temp) {
      let h = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#94a3b8"/></marker><marker id="arrs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--brand)"/></marker></defs>';
      tree.nodes.forEach(n => {
        const card = $(`.fe-card[data-id="${CSS.escape(n.id)}"]`, world);
        if (!card) return;
        (n.options || []).forEach((o, i) => {
          if (o.action !== 'goto') return;
          const t = nodeById(o.target); if (!t) return;
          const hot = sel === n.id || sel === t.id;
          const back = t.x >= n.x;
          h += `<path d="${curve(portPos(card, i), inPos(t))}" class="fe-edge ${hot ? 'hot' : ''} ${back ? 'back' : ''}" marker-end="url(#${hot ? 'arrs' : 'arr'})" data-from="${esc(n.id)}" data-i="${i}"/>`;
        });
      });
      if (temp) h += `<path d="${curve(temp.a, temp.b)}" class="fe-edge temp"/>`;
      svg.innerHTML = h;
      $$('.fe-edge:not(.temp)', svg).forEach(p => p.onclick = (e) => {
        e.stopPropagation();
        if (confirm('فك ربط هذا الزر؟ سيبقى الزر في المحادثة دون انتقال حتى تربطه بعقدة أخرى أو تغيّر إجراءه.')) { const o = nodeById(p.dataset.from).options[p.dataset.i]; o.target = ''; setDirty(); drawCards(); renderSide(); }
      });
    }

    const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; };
    window.addEventListener('pointermove', (e) => {
      if (!drag || drag.type !== 'node' || drag.pointerId !== e.pointerId) return;
      const p = toWorld(e); drag.n.x = Math.round(p.x - drag.ox); drag.n.y = Math.round(p.y - drag.oy); drag.moved = true;
      drag.card.style.left = drag.n.x + 'px'; drag.card.style.top = drag.n.y + 'px'; drawEdges();
    });
    window.addEventListener('pointerup', (e) => {
      if (drag?.type !== 'node' || drag.pointerId !== e.pointerId) return;
      if (drag.moved) setDirty(); drag = null;
    });

    function bindCard(card) {
      const n = nodeById(card.dataset.id);
      card.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.fe-port,.fe-addopt')) return;
        e.stopPropagation();
        if (sel !== n.id) { sel = n.id; $$('.fe-card', world).forEach(c => c.classList.toggle('sel', c === card)); renderSide(); drawEdges(); }
        if (!e.target.closest('.fe-head')) return;
        const p = toWorld(e);
        drag = { type: 'node', n, card, pointerId: e.pointerId, ox: p.x - n.x, oy: p.y - n.y, moved: false };
        card.setPointerCapture(e.pointerId);
      });
      $$('.fe-port', card).forEach(port => port.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        drag = { type: 'link', n, i: Number(port.dataset.port), a: portPos(card, Number(port.dataset.port)) };
        canvas.setPointerCapture(e.pointerId);
      }));
      $('.fe-addopt', card).onclick = (e) => { e.stopPropagation(); (n.options = n.options || []).push({ label: 'زر جديد', action: 'answer', target: 'اكتب رد البوت هنا' }); sel = n.id; setDirty(); drawCards(); renderSide(); };
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.fe-card')) return;
      drag = { type: 'pan', sx: e.clientX - view.x, sy: e.clientY - view.y, moved: false };
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('panning');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.type === 'pan') { view.x = e.clientX - drag.sx; view.y = e.clientY - drag.sy; drag.moved = true; applyView(); }
      if (drag.type === 'link') {
        const input = document.elementFromPoint(e.clientX, e.clientY)?.closest('.fe-in');
        $$('.fe-in', world).forEach(el => el.classList.toggle('drop-target', !!input && el === input && el.closest('.fe-card')?.dataset.id !== drag.n.id));
        drawEdges({ a: drag.a, b: toWorld(e) });
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      canvas.classList.remove('panning');
      if (!drag) return;
      if (drag.type === 'pan' && !drag.moved && sel) { sel = null; drawCards(); renderSide(); }
      if (drag.type === 'link') {
        const o = drag.n.options[drag.i];
        const input = document.elementFromPoint(e.clientX, e.clientY)?.closest('.fe-in');
        const hit = input?.closest('.fe-card');
        if (o.action === 'goto' && hit && hit.dataset.id !== drag.n.id && nodeById(hit.dataset.id)) {
          o.target = hit.dataset.id;
          setDirty(); drawCards(); renderSide();
        } else if (hit?.dataset.id === drag.n.id) {
          err('لا يمكن ربط العقدة بنفسها. اختر دائرة مدخل لعقدة أخرى.'); drawEdges();
        } else {
          err('لم يتم الربط. أسقط الدائرة على دائرة المدخل أعلى عقدة مناسبة، أو اختر العقدة من القائمة الجانبية.');
          drawEdges();
        }
        $$('.fe-in', world).forEach(el => el.classList.remove('drop-target'));
      }
      drag = null;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const nz = Math.min(1.8, Math.max(0.3, view.z * (e.deltaY < 0 ? 1.1 : 0.9)));
      view.x = mx - (mx - view.x) * (nz / view.z); view.y = my - (my - view.y) * (nz / view.z); view.z = nz; applyView();
    }, { passive: false });

    const fit = () => {
      if (!tree.nodes.length) return;
      const xs = tree.nodes.map(n => n.x), ys = tree.nodes.map(n => n.y);
      const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40, maxX = Math.max(...xs) + 320, maxY = Math.max(...ys) + 280;
      const r = canvas.getBoundingClientRect();
      view.z = Math.min(1.2, Math.max(0.3, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
      view.x = (r.width - (maxX - minX) * view.z) / 2 - minX * view.z; view.y = (r.height - (maxY - minY) * view.z) / 2 - minY * view.z; applyView();
    };
    const zoom = (f) => { const r = canvas.getBoundingClientRect(); const cx = r.width / 2, cy = r.height / 2, nz = Math.min(1.8, Math.max(0.3, view.z * f)); view.x = cx - (cx - view.x) * (nz / view.z); view.y = cy - (cy - view.y) * (nz / view.z); view.z = nz; applyView(); };

    function renderSide() {
      const side = $('#fe-side');
      const n = sel && nodeById(sel);
      if (!n) {
        const orphans = tree.nodes.filter(x => x.id !== tree.root && !tree.nodes.some(y => (y.options || []).some(o => o.action === 'goto' && o.target === x.id)));
        side.innerHTML = `<h3>شجرة الردود</h3>
          <p class="muted" style="font-size:13px;line-height:1.8">اضغط على أي عقدة لتعديلها. كل عقدة = رسالة من البوت وأزرار، وكل زر ينفذ إجراء.</p>
          <div class="fe-legend">${Object.values(ACT_META).map(m => `<div><span class="fe-ic" style="background:${m.color}">${m.icon}</span>${m.label}</div>`).join('')}</div>
          <div class="kv" style="margin-top:14px"><span>العقد</span><b>${tree.nodes.length}</b><span>الأزرار</span><b>${tree.nodes.reduce((a, x) => a + (x.options || []).length, 0)}</b></div>
          ${orphans.length ? `<div class="pending" style="margin-top:14px">⚠️ عقد لا يصل لها أي زر: ${orphans.map(o => esc(o.title || o.id)).join('، ')}</div>` : ''}
          <p class="muted" style="font-size:12.5px;margin-top:14px">استخدم <code>{name}</code> في الرسالة لاسم المستفيد. الكلمات بين نجمتين <code>*هكذا*</code> تظهر بخط عريض.</p>`;
        return;
      }
      const ids = tree.nodes.map(x => x.id);
      side.innerHTML = `
        <div class="row" style="margin-bottom:10px"><h3 style="margin:0">تعديل العقدة</h3><span class="sp"></span><button class="btn sm" id="fs-close">✕</button></div>
        <p class="fe-intro">العقدة هي خطوة في المحادثة. اكتب الرسالة التي يراها العميل، ثم حدّد ما يحدث عند ضغطه كل زر.</p>
        <label class="f"><span>اسم العقدة</span><input id="fs-title" value="${esc(n.title || '')}"><small>اسم داخلي يساعدك على تمييز هذه الخطوة في الشجرة.</small></label>
        <label class="f"><span>رسالة البوت للعميل</span><textarea id="fs-msg" rows="4">${esc(n.message || '')}</textarea><small>هذه الرسالة تظهر قبل الأزرار. يمكنك استخدام {name} لإدراج اسم العميل.</small></label>
        <div class="row" style="margin:6px 0 8px"><b style="font-size:14px">الأزرار</b><span class="sp"></span><button class="btn sm" id="fs-addopt">＋ زر</button></div>
        ${(n.options || []).map((o, i) => `
          <div class="fs-opt" data-i="${i}">
            <div class="row" style="gap:6px"><input data-o="label" value="${esc(o.label)}" placeholder="نص الزر" style="flex:1">
              <button class="btn sm" data-mv="-1" title="أعلى">↑</button><button class="btn sm" data-mv="1" title="أسفل">↓</button><button class="btn sm dan" data-del>✕</button></div>
            <div class="row" style="gap:6px;margin-top:6px">
              <select data-o="action" aria-label="الإجراء الذي ينفذه الزر">${Object.entries(ACTIONS).map(([k, l]) => `<option value="${k}" ${o.action === k ? 'selected' : ''}>${ACT_META[k].icon} ${l}</option>`).join('')}</select>
              ${o.action === 'goto' ? `<select data-o="target" style="flex:1"><option value="">— اختر —</option>${tree.nodes.filter(x => x.id !== n.id).map(x => `<option value="${esc(x.id)}" ${o.target === x.id ? 'selected' : ''}>${esc(x.title || x.id)}</option>`).join('')}</select>` : ''}
            </div>
            ${o.action === 'url' ? `<input data-o="target" value="${esc(o.target || '')}" placeholder="https://..." dir="ltr" style="margin-top:6px">` : ''}
            ${o.action === 'answer' ? `<textarea data-o="target" rows="2" placeholder="نص الرد" style="margin-top:6px">${esc(o.target || '')}</textarea>` : ''}
            <small class="action-help">${esc(ACTION_HELP[o.action] || 'اختر الإجراء الذي سيحدث عند ضغط العميل على هذا الزر.')}</small>
          </div>`).join('')}
        <div class="row" style="margin-top:14px">
          ${n.id !== tree.root ? '<button class="btn sm" id="fs-root" title="تظهر هذه العقدة أولاً بدلاً من رسالة الترحيب الحالية">▶ اجعلها البداية</button><button class="btn sm" id="fs-dup">⧉ نسخ</button><span class="sp"></span><button class="btn sm dan" id="fs-del">حذف العقدة</button>' : '<span class="muted" style="font-size:12.5px">هذه عقدة البداية؛ تظهر أولاً عند بدء المحادثة</span><span class="sp"></span><button class="btn sm" id="fs-dup">⧉ نسخ</button>'}
        </div>
        <details style="margin-top:12px"><summary class="muted" style="cursor:pointer;font-size:12.5px">متقدم</summary>
          <label class="f" style="margin-top:8px"><span>المعرّف</span><input id="fs-id" value="${esc(n.id)}" dir="ltr"></label></details>`;
      const refreshCard = () => { const c = $(`.fe-card[data-id="${CSS.escape(n.id)}"]`, world); if (c) { c.outerHTML = cardHTML(n); bindCard($(`.fe-card[data-id="${CSS.escape(n.id)}"]`, world)); } drawEdges(); };
      $('#fs-close').onclick = () => { sel = null; drawCards(); renderSide(); };
      $('#fs-title').oninput = (e) => { n.title = e.target.value; setDirty(); refreshCard(); };
      $('#fs-msg').oninput = (e) => { n.message = e.target.value; setDirty(); refreshCard(); };
      $('#fs-addopt').onclick = () => { (n.options = n.options || []).push({ label: 'زر جديد', action: 'answer', target: 'اكتب رد البوت هنا' }); setDirty(); refreshCard(); renderSide(); };
      $$('.fs-opt', side).forEach(row => {
        const i = Number(row.dataset.i), o = n.options[i];
        $$('[data-o]', row).forEach(inp => {
          const ev = inp.tagName === 'SELECT' ? 'onchange' : 'oninput';
          inp[ev] = () => {
            o[inp.dataset.o] = inp.value;
            if (inp.dataset.o === 'action') { o.target = ''; renderSide(); }
            setDirty(); refreshCard();
          };
        });
        $('[data-del]', row).onclick = () => { n.options.splice(i, 1); setDirty(); refreshCard(); renderSide(); };
        $$('[data-mv]', row).forEach(b => b.onclick = () => { const j = i + Number(b.dataset.mv); if (j < 0 || j >= n.options.length) return; [n.options[i], n.options[j]] = [n.options[j], n.options[i]]; setDirty(); refreshCard(); renderSide(); });
      });
      $('#fs-root')?.addEventListener('click', () => {
        if (!confirm('ستظهر هذه العقدة للعميل أولاً بدلاً من الترحيب الحالي. هل تريد تغيير بداية المحادثة؟')) return;
        tree.root = n.id; setDirty(); drawCards(); renderSide();
      });
      $('#fs-dup').onclick = () => { const id = 'node_' + Math.random().toString(36).slice(2, 7); tree.nodes.push({ ...JSON.parse(JSON.stringify(n)), id, title: (n.title || '') + ' (نسخة)', x: n.x + 40, y: n.y + 40 }); sel = id; setDirty(); drawCards(); renderSide(); };
      $('#fs-del')?.addEventListener('click', () => {
        if (!confirm('حذف العقدة "' + (n.title || n.id) + '"؟')) return;
        tree.nodes = tree.nodes.filter(x => x !== n);
        tree.nodes.forEach(x => (x.options || []).forEach(o => { if (o.action === 'goto' && o.target === n.id) o.target = ''; }));
        sel = null; setDirty(); drawCards(); renderSide();
      });
      $('#fs-id').onchange = (e) => {
        const v = e.target.value.trim();
        if (!v || tree.nodes.some(x => x !== n && x.id === v)) { err('معرّف غير صالح أو مكرر'); e.target.value = n.id; return; }
        tree.nodes.forEach(x => (x.options || []).forEach(o => { if (o.action === 'goto' && o.target === n.id) o.target = v; }));
        if (tree.root === n.id) tree.root = v;
        n.id = v; sel = v; setDirty(); drawCards();
      };
    }

    document.onkeydown = (e) => {
      if (page() !== 'tree') { document.onkeydown = null; return; }
      if ((e.key === 'Delete') && sel && sel !== tree.root && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) $('#fs-del')?.click();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('#fe-save').click(); }
    };

    $('#fe-add').onclick = () => {
      const r = canvas.getBoundingClientRect();
      const id = 'node_' + Math.random().toString(36).slice(2, 7);
      tree.nodes.push({ id, title: 'عقدة جديدة', message: 'اكتب رسالة البوت هنا', x: Math.round((r.width / 2 - view.x) / view.z - 140), y: Math.round((r.height / 2 - view.y) / view.z - 80), options: [{ label: '🏠 القائمة الرئيسية', action: 'goto', target: tree.root }] });
      sel = id; setDirty(); drawCards(); renderSide();
    };
    $('#fe-layout').onclick = () => { autoLayout(tree); setDirty(); drawCards(); fit(); };
    $('#fe-fit').onclick = fit;
    $('#fe-zi').onclick = () => zoom(1.15); $('#fe-zo').onclick = () => zoom(0.87);
    $('#fe-reset').onclick = async () => { if (confirm('استعادة الشجرة الافتراضية؟ ستفقد تعديلاتك.')) { const r = await api('POST', `/api/sites/${site().id}/reset-tree`); site().tree = r.tree; renderTree(); } };
    $('#fe-save').onclick = async () => {
      const broken = tree.nodes.flatMap(n => (n.options || []).filter(o => o.action === 'goto' && !nodeById(o.target)).map(o => `${n.title || n.id} ← ${o.label}`));
      if (broken.length && !confirm('هذه الأزرار غير مربوطة بأي عقدة وستعيد المستفيد للبداية:\n' + broken.join('\n') + '\n\nحفظ على أي حال؟')) return;
      await saveSite({ tree }, 'تم حفظ الشجرة');
      dirty = false; $('#fe-dirty').textContent = '';
    };
    window.onbeforeunload = () => (dirty && page() === 'tree') ? 'unsaved' : undefined;

    drawCards(); renderSide(); applyView();
    requestAnimationFrame(fit);
  }

  /* ============================ knowledge base ============================ */
  function kbModal(item = {}) {
    let attachments = [];
    try { attachments = Array.isArray(item.media) ? item.media.map(m => ({ ...m })) : JSON.parse(item.media || '[]').map(m => ({ ...m })); } catch { attachments = []; }
    modal(`<h3>${item.id ? 'تعديل إجابة' : 'إضافة إجابة إلى قاعدة المعرفة'}</h3>
      <label class="f"><span>السؤال</span><input id="kq" value="${esc(item.question || '')}"></label>
      <label class="f"><span>الإجابة</span><textarea id="ka" rows="4">${esc(item.answer || '')}</textarea></label>
      <label class="f"><span>مرفقات الإجابة (اختياري)</span><input id="kmfiles" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/ogg,application/pdf" multiple><small>صور، فيديو أو PDF · حتى 20 ميجابايت للملف و5 ملفات للإجابة</small></label>
      <div id="kmlist" style="display:grid;gap:6px;margin:-4px 0 12px"></div>
      <label class="f"><span>كلمات مفتاحية (اختياري، مفصولة بفاصلة)</span><input id="kk" value="${esc(item.keywords || '')}" placeholder="شحن، توصيل، مدة"><small>تساعد البوت على مطابقة أسئلة مختلفة الصياغة</small></label>
      <div class="row"><button class="btn pri" id="ks">حفظ</button><button class="btn" data-close>إلغاء</button></div>`, (m, close) => {
      const list = $('#kmlist', m);
      const drawAttachments = () => {
        list.innerHTML = attachments.map((f, i) => `<div class="row" style="justify-content:space-between;border:1px solid var(--line);border-radius:9px;padding:7px 10px"><span style="overflow-wrap:anywhere">${f.type === 'image' ? '🖼️' : f.type === 'video' ? '🎬' : '📄'} ${esc(f.name)}${f.file ? ' <small class="muted">جاهز للرفع</small>' : ''}</span><button type="button" class="btn sm dan" data-km-remove="${i}">إزالة</button></div>`).join('');
        $$('[data-km-remove]', list).forEach(b => b.onclick = () => { attachments.splice(Number(b.dataset.kmRemove), 1); drawAttachments(); });
      };
      $('#kmfiles', m).onchange = (e) => {
        const files = Array.from(e.target.files || []);
        const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg', 'application/pdf'];
        if (files.some(f => !supported.includes(f.type))) err('الصيغ المدعومة: JPG وPNG وGIF وWebP وMP4 وWebM وOGG وPDF.');
        if (files.some(f => f.size > 20 * 1024 * 1024)) err('حجم الملف الأقصى 20 ميجابايت.');
        files.filter(f => f.size <= 20 * 1024 * 1024 && supported.includes(f.type)).forEach(file => {
          if (attachments.length >= 5) return err('يمكن إرفاق 5 ملفات كحد أقصى لكل إجابة.');
          attachments.push({ name: file.name, type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'pdf', file });
        });
        e.target.value = ''; drawAttachments();
      };
      drawAttachments();
      $('#ks', m).onclick = async () => {
        const saveButton = $('#ks', m);
        saveButton.disabled = true; saveButton.textContent = 'جارٍ حفظ الإجابة ومرفقاتها…';
        try {
          const media = [];
          for (const a of attachments) {
            if (!a.file) { media.push({ url: a.url, name: a.name, type: a.type }); continue; }
            const url = `/api/media?type=${encodeURIComponent(a.file.type)}&name=${encodeURIComponent(a.file.name)}`;
            const up = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/octet-stream' }, body: a.file });
            const result = await up.json();
            if (!up.ok) throw new Error(result.error || 'تعذر رفع المرفق');
            media.push(result);
          }
          const body = { question: $('#kq', m).value, answer: $('#ka', m).value, keywords: $('#kk', m).value, media };
          if (item.id) await api('PUT', '/api/kb/' + item.id, body);
          else await api('POST', '/api/kb', { ...body, site_id: item.site_id || S.siteId, conversation_id: item.conversation_id });
          ok('تم الحفظ'); close(); if (page() === 'kb') loadKB();
        } catch (e) { saveButton.disabled = false; saveButton.textContent = 'حفظ'; err(e); }
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
      ${items.map(k => { let mediaCount = 0; try { mediaCount = (Array.isArray(k.media) ? k.media : JSON.parse(k.media || '[]')).length; } catch {} return `<tr data-id="${k.id}"><td><b>${esc(k.question)}</b>${k.keywords ? `<br><small class="muted">🔑 ${esc(k.keywords)}</small>` : ''}</td><td style="max-width:320px">${esc(k.answer)}${mediaCount ? `<br><small class="muted">📎 ${mediaCount} مرفق</small>` : ''}</td>
        <td><span class="tag ${k.source}">${k.source === 'learned' ? 'متعلَّمة' : 'يدوي'}</span>${k.source_conversation ? `<br><a href="#/conv/${k.source_conversation}" style="font-size:12px">محادثة #${k.source_conversation}</a>` : ''}</td>
        <td>${k.hits}</td><td><input type="checkbox" data-act ${k.active ? 'checked' : ''}></td>
        <td style="white-space:nowrap"><button class="btn sm" data-ed>تعديل</button>${can('supervisor') ? '<button class="btn sm dan" data-rm>حذف</button>' : ''}</td></tr>`; }).join('')}</tbody></table>`
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

  /* ============================ identity & appearance ============================ */
  const W_ICONS = {
    chat: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3zM7.5 12.4a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm4.5 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm4.5 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z"/></svg>',
    square: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 3h16a2 2 0 012 2v11a2 2 0 01-2 2H9l-4.6 3.5c-.5.4-1.4 0-1.4-.7V5a2 2 0 011-2z"/></svg>',
    headset: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2.5" y="13" width="4.5" height="7" rx="2" fill="currentColor"/><rect x="17" y="13" width="4.5" height="7" rx="2" fill="currentColor"/><path d="M19 20c0 1.5-2 2-5 2"/></svg>',
    help: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.3a2.8 2.8 0 015.4 1c0 1.9-2.7 2.4-2.7 4"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7zM19 15l1 2.7 2.7 1-2.7 1L19 22.5l-1-2.8-2.7-1 2.7-1z"/></svg>',
    wave: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z" opacity=".35"/><path d="M8 12.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="9.5" r="1.2"/><circle cx="15" cy="9.5" r="1.2"/></svg>'
  };
  const PALETTES = [
    { name: 'نعناعي', v: { primary_color: '#41b072', secondary_color: '#2f9e63', header_bg: '', header_text: '', chat_bg: '#f6f7f9', bot_bubble_bg: '#ffffff', bot_bubble_text: '#111827', visitor_bubble_bg: '', visitor_bubble_text: '', launcher_bg: '', header_style: 'solid', launcher_style: 'solid' } },
    { name: 'أزرق ملكي', v: { primary_color: '#2563eb', secondary_color: '#1e40af', header_bg: '#1e3a8a', header_text: '', chat_bg: '#f1f5ff', bot_bubble_bg: '#ffffff', bot_bubble_text: '#0f172a', visitor_bubble_bg: '#2563eb', visitor_bubble_text: '', launcher_bg: '#2563eb', header_style: 'gradient', launcher_style: 'solid' } },
    { name: 'بنفسجي متدرج', v: { primary_color: '#7c3aed', secondary_color: '#db2777', header_bg: '#7c3aed', header_text: '', chat_bg: '#faf5ff', bot_bubble_bg: '#ffffff', bot_bubble_text: '#1f1235', visitor_bubble_bg: '#7c3aed', visitor_bubble_text: '', launcher_bg: '#7c3aed', header_style: 'gradient', launcher_style: 'gradient' } },
    { name: 'ليلي', v: { primary_color: '#22d3ee', secondary_color: '#0ea5e9', header_bg: '#0f172a', header_text: '#ffffff', chat_bg: '#0b1220', bot_bubble_bg: '#1e293b', bot_bubble_text: '#e2e8f0', visitor_bubble_bg: '#0891b2', visitor_bubble_text: '#ffffff', launcher_bg: '#0f172a', header_style: 'solid', launcher_style: 'solid' } },
    { name: 'ذهبي فاخر', v: { primary_color: '#b8860b', secondary_color: '#92400e', header_bg: '#1c1917', header_text: '#fbbf24', chat_bg: '#faf7f0', bot_bubble_bg: '#ffffff', bot_bubble_text: '#1c1917', visitor_bubble_bg: '#1c1917', visitor_bubble_text: '#fbbf24', launcher_bg: '#1c1917', header_style: 'solid', launcher_style: 'solid' } },
    { name: 'وردي ناعم', v: { primary_color: '#ec4899', secondary_color: '#f472b6', header_bg: '#ec4899', header_text: '', chat_bg: '#fff5f9', bot_bubble_bg: '#ffffff', bot_bubble_text: '#3b0a24', visitor_bubble_bg: '#ec4899', visitor_bubble_text: '', launcher_bg: '#ec4899', header_style: 'gradient', launcher_style: 'solid' } },
    { name: 'برتقالي', v: { primary_color: '#ea580c', secondary_color: '#f59e0b', header_bg: '#ea580c', header_text: '', chat_bg: '#fff8f1', bot_bubble_bg: '#ffffff', bot_bubble_text: '#1f2937', visitor_bubble_bg: '#ea580c', visitor_bubble_text: '', launcher_bg: '#ea580c', header_style: 'gradient', launcher_style: 'gradient' } },
    { name: 'رسمي رمادي', v: { primary_color: '#334155', secondary_color: '#64748b', header_bg: '#ffffff', header_text: '#0f172a', chat_bg: '#f8fafc', bot_bubble_bg: '#ffffff', bot_bubble_text: '#0f172a', visitor_bubble_bg: '#334155', visitor_bubble_text: '#ffffff', launcher_bg: '#334155', header_style: 'solid', launcher_style: 'solid' } }
  ];

  function renderAppearance() {
    setTitle('الهوية والمظهر');
    const st = { a: JSON.parse(JSON.stringify(site().settings.appearance)), p: JSON.parse(JSON.stringify(site().settings.prechat)), dash: JSON.parse(JSON.stringify(dashboardPrefs)), dashMode: document.body.dataset.theme === 'dark' ? 'dark' : 'light', tab: 'identity', dirty: false };
    const A = st.a;
    if (A.islamic_pattern && (!A.decoration_style || A.decoration_style === 'none')) A.decoration_style = 'geometric';

    const colorField = (k, label, auto = true, hint = '') => `
      <label class="f"><span>${label}</span><div class="colorrow">
        <input type="color" data-c="${k}" value="${esc(A[k] || '#ffffff')}" ${!A[k] && auto ? 'style="opacity:.35"' : ''}>
        <input data-ct="${k}" value="${esc(A[k] || '')}" placeholder="${auto ? 'تلقائي' : ''}" dir="ltr" style="width:110px">
        ${auto ? `<button type="button" class="btn sm" data-auto="${k}">تلقائي</button>` : ''}</div>${hint ? `<small>${hint}</small>` : ''}</label>`;
    const range = (k, label, min, max, step, unit) => `
      <label class="f"><span>${label}: <b data-rv="${k}">${A[k]}</b> ${unit}</span><input type="range" data-r="${k}" min="${min}" max="${max}" step="${step}" value="${A[k]}" style="width:100%;accent-color:var(--brand)"></label>`;
    const txt = (k, label, ph = '') => `<label class="f"><span>${label}</span><input data-t="${k}" value="${esc(A[k] ?? '')}" placeholder="${esc(ph)}"></label>`;
    const img = (k, label, hint) => `
      <label class="f"><span>${label}</span><div class="row"><div class="imgprev" style="border-radius:12px;width:64px;height:64px" id="pv_${k}">${A[k] ? `<img src="${esc(A[k])}" style="object-fit:contain">` : '<span class="muted" style="font-size:11px">لا يوجد</span>'}</div>
        <input type="file" accept="image/*" data-img="${k}" style="flex:1"><button type="button" class="btn sm" data-clr="${k}">إزالة</button></div>${hint ? `<small>${hint}</small>` : ''}</label>`;

    const tabs = {
      identity: () => `
        <div class="card" style="margin-bottom:14px"><h3>🏢 هوية الشركة</h3>
          ${txt('company_name', 'اسم الشركة', 'مثال: متجر الأمل')}
          ${img('company_logo', 'شعار الشركة', 'يظهر في أعلى نافذة المحادثة وفي شاشة البداية. يفضل PNG بخلفية شفافة.')}
          <label class="f"><span>نبذة ومعلومات النشاط التجاري</span><textarea data-t="company_description" rows="4" placeholder="اكتب نبذة النشاط، الخدمات، أوقات العمل، أو أي معلومات تريد أن يرسلها البوت">${esc(A.company_description || '')}</textarea><small>تظهر للعميل عند اختياره «معلومات النشاط التجاري» في قائمة الترحيب.</small></label>
          <div class="grid g2">${txt('footer_text', 'نص التذييل قبل اسم الشركة', 'بدعم من')}
          <label class="f"><span>إظهار التذييل</span><select data-s="show_footer"><option value="true">نعم</option><option value="false">لا</option></select></label></div>
        </div>
        <div class="card"><h3>🤖 المساعد</h3>
          <div class="grid g2">${txt('title', 'عنوان النافذة')}${txt('subtitle', 'العنوان الفرعي')}${txt('bot_name', 'اسم البوت')}
          <label class="f"><span>اتجاه النص</span><select data-s="dir"><option value="rtl">عربي (RTL)</option><option value="ltr">English (LTR)</option></select></label></div>
          <h4 style="margin:12px 0 8px;font-size:13.5px;color:var(--muted)">معلومات تظهر للمستفيد</h4>
          <div class="grid g2">${txt('company_phone', 'هاتف النشاط التجاري', '+966...')}${txt('company_email', 'البريد الإلكتروني للنشاط', 'info@example.org')}${txt('unified_number', 'الرقم الموحد للنشاط', '9200XXXXXX')}${txt('company_website', 'رابط الموقع الإلكتروني', 'https://example.org')}${txt('company_location', 'عنوان النشاط التجاري', 'المدينة، الحي، الشارع')}${txt('company_map_url', 'رابط خرائط Google (اختياري)', 'https://maps.app.goo.gl/...')}</div>
          ${img('bot_avatar', 'صورة البوت (تظهر بجانب رسائله)')}
          <label class="f"><span>خط المحادثة</span><select data-s="font"><option value="">خط الموقع الافتراضي</option><option value="Tahoma">Tahoma</option><option value="Arial">Arial</option><option value="'IBM Plex Sans Arabic'">IBM Plex Sans Arabic</option><option value="'Noto Sans Arabic'">Noto Sans Arabic</option><option value="'Noto Naskh Arabic'">Noto Naskh Arabic</option><option value="'Cairo'">Cairo</option><option value="'Tajawal'">Tajawal</option><option value="'Amiri'">Amiri — خط نسخي</option><option value="'Reem Kufi'">Reem Kufi — كوفي</option><option value="'Aref Ruqaa'">Aref Ruqaa — رقعة</option><option value="'El Messiri'">El Messiri</option></select><small>يتحمّل الخط العربي المختار تلقائيًا للزائر.</small></label>
          <div class="font-sample" id="chat-font-sample" dir="rtl">مرحباً، كيف نقدر نساعدك اليوم؟ ١٢٣٤٥٦</div>
          <div class="card decor-card"><h3>✦ زخرفة المحادثة</h3><p class="muted">اختر زخرفة خلفية خفيفة لمنطقة الرسائل، أو اعرض حروفًا عربية زخرفية.</p>
            <label class="f"><span>نوع الزخرفة</span><select data-s="decoration_style"><option value="none">بدون زخرفة</option><option value="geometric">نجوم وأشكال هندسية إسلامية</option><option value="arabesque">أرابيسك إسلامي</option><option value="arabic_letters">حروف عربية زخرفية</option></select></label>
            <div class="grid g2">${colorField('decoration_color', 'لون الزخرفة', true, 'اتركه تلقائيًا لاستخدام اللون الرئيسي.')}${range('decoration_opacity', 'وضوح الزخرفة', 0.03, 0.18, 0.01, '')}</div>
          </div>
        </div>`,
      colors: () => `
        <div class="card" style="margin-bottom:14px"><h3>🎨 قوالب ألوان جاهزة</h3>
          <div class="pal-grid">${PALETTES.map((p, i) => `<button type="button" class="pal" data-pal="${i}">
            <span class="pal-sw"><i style="background:${p.v.header_style === 'gradient' ? `linear-gradient(135deg,${p.v.header_bg || p.v.primary_color},${p.v.secondary_color})` : (p.v.header_bg || p.v.primary_color)}"></i><i style="background:${p.v.chat_bg}"></i><i style="background:${p.v.visitor_bubble_bg || p.v.primary_color}"></i></span>${p.name}</button>`).join('')}</div>
        </div>
        <div class="card"><h3>🖌️ ألوان مخصصة</h3>
          <div class="grid g2">
            ${colorField('primary_color', 'اللون الرئيسي', false, 'الأزرار والروابط وكل ما لم يُحدد له لون')}
            ${colorField('secondary_color', 'اللون الثانوي', true, 'يُستخدم في التدرج')}
            ${colorField('header_bg', 'خلفية رأس المحادثة')}
            ${colorField('header_text', 'نص رأس المحادثة')}
            ${colorField('panel_bg', 'خلفية النافذة والنماذج', false)}
            ${colorField('panel_text', 'نص النافذة والنماذج', false)}
            ${colorField('chat_bg', 'خلفية سجل الرسائل', false)}
            ${colorField('bot_bubble_bg', 'فقاعة ردود المساعد', false)}
            ${colorField('bot_bubble_text', 'نص ردود المساعد', false)}
            ${colorField('agent_bubble_bg', 'فقاعة الموظف')}
            ${colorField('agent_bubble_text', 'نص الموظف')}
            ${colorField('visitor_bubble_bg', 'فقاعة العميل')}
            ${colorField('visitor_bubble_text', 'نص العميل')}
            ${colorField('avatar_bg', 'خلفية صور/أيقونات المساعد والموظف')}
            ${colorField('system_bg', 'خلفية تنبيهات النظام', false)}
            ${colorField('system_text', 'نص تنبيهات النظام', false)}
            ${colorField('input_bg', 'خلفية حقل الكتابة', false)}
            ${colorField('input_text', 'نص حقل الكتابة', false)}
            ${colorField('footer_bg', 'خلفية أسفل النافذة', false)}
            ${colorField('footer_text', 'نص أسفل النافذة', false)}
            ${colorField('teaser_bg', 'خلفية رسالة الترحيب المنبثقة', false)}
            ${colorField('teaser_text', 'نص رسالة الترحيب المنبثقة', false)}
            ${colorField('launcher_label_bg', 'خلفية تسمية زر المحادثة', false)}
            ${colorField('launcher_label_text', 'نص تسمية زر المحادثة', false)}
            ${colorField('launcher_bg', 'خلفية زر فتح المحادثة')}
            ${colorField('launcher_text', 'أيقونة زر فتح المحادثة')}
          </div>
          <div class="grid g2">
            <label class="f"><span>نمط الرأس</span><select data-s="header_style"><option value="solid">لون واحد</option><option value="gradient">متدرج</option></select></label>
            <label class="f"><span>نمط زر المحادثة</span><select data-s="launcher_style"><option value="solid">لون واحد</option><option value="gradient">متدرج</option></select></label>
          </div>
        </div>`,
      shapes: () => `
        <div class="card" style="margin-bottom:14px"><h3>🔘 شكل زر المحادثة</h3>
          <div class="shape-grid">${[['circle', 'دائري', '999px', 54], ['rounded', 'زوايا ناعمة', '16px', 54], ['square', 'مربع', '6px', 54], ['pill', 'زر بنص', '999px', 'auto']].map(([k, l, r, w]) =>
            `<button type="button" class="shape ${A.launcher_shape === k ? 'on' : ''}" data-shape="${k}"><span style="border-radius:${r};width:${w === 'auto' ? 'auto' : w + 'px'};${w === 'auto' ? 'padding:0 14px;gap:6px;' : ''}">${W_ICONS.chat.replace(/26/g, '22')}${w === 'auto' ? '<em>تحدث معنا</em>' : ''}</span>${l}</button>`).join('')}</div>
          <h4 style="margin:16px 0 8px;font-size:13.5px;color:var(--muted)">أيقونة الزر</h4>
          <div class="icon-grid">${Object.keys(W_ICONS).map(k => `<button type="button" class="ico ${(!A.launcher_icon && (A.launcher_icon_preset || 'chat') === k) ? 'on' : ''}" data-ico="${k}">${W_ICONS[k]}</button>`).join('')}</div>
          ${img('launcher_icon', 'أو ارفع صورة/أيقونة خاصة للزر', 'عند رفع صورة تُستخدم بدل الأيقونة المختارة.')}
          ${txt('launcher_label', 'نص الزر (للشكل "زر بنص") أو بجانب الزر', 'تحدث معنا')}
          ${range('launcher_size', 'حجم الزر', 44, 96, 2, 'px')}
        </div>
        <div class="card" style="margin-bottom:14px"><h3>📐 النافذة والفقاعات</h3>
          ${range('window_width', 'عرض النافذة', 320, 460, 10, 'px')}
          ${range('window_radius', 'استدارة زوايا النافذة', 0, 28, 1, 'px')}
          ${range('bubble_radius', 'استدارة فقاعات الرسائل', 2, 24, 1, 'px')}
          ${range('font_size', 'حجم خط الرسائل', 12, 18, 0.5, 'px')}
        </div>
        <div class="card"><h3>📍 الموضع</h3>
          <div class="grid g3"><label class="f"><span>الجهة</span><select data-s="position"><option value="right">يمين</option><option value="left">يسار</option></select></label>
          ${range('offset_x', 'بعد أفقي', 0, 80, 2, 'px')}${range('offset_y', 'بعد من الأسفل', 0, 120, 2, 'px')}</div>
          <label class="chk"><input type="checkbox" data-b="hide_on_mobile" ${A.hide_on_mobile ? 'checked' : ''}> إخفاء على الجوال</label>
        </div>`,
      texts: () => `<div class="card"><h3>✍️ النصوص</h3><div class="grid g2">
          ${txt('teaser', 'رسالة ترحيب منبثقة فوق الزر')}${range('teaser_delay', 'تظهر بعد', 0, 30, 1, 'ثانية')}
          ${txt('placeholder', 'نص حقل الكتابة')}${txt('start_label', 'زر بدء المحادثة')}
          ${txt('end_label', 'زر إنهاء المحادثة')}${txt('new_chat_label', 'زر محادثة جديدة')}</div>
          <p class="muted" style="font-size:13px;margin:0">رسالة الترحيب داخل المحادثة تُعدّل من <a href="#/tree">شجرة الردود</a>.</p></div>`,
      rating: () => `<div class="card"><h3>⭐ التقييم</h3>
          ${range('rating_max', 'عدد النجوم', 3, 10, 1, '')}
          <div id="rdemo" style="padding:10px;background:var(--soft);border-radius:10px;margin-bottom:12px"></div>
          <div class="grid g2">${txt('rating_title', 'عنوان التقييم')}${txt('rating_comment_placeholder', 'حقل الملاحظات')}${txt('rating_thanks', 'رسالة الشكر')}</div>
          <p class="muted" style="font-size:13px;margin:0">يدعم أنصاف النجوم، واللون يتدرج من الأحمر (نصف نجمة) إلى الأخضر (العلامة الكاملة).</p></div>`,
      prechat: () => `<div class="card"><h3>📝 نموذج ما قبل المحادثة</h3>
          <label class="chk"><input type="checkbox" data-pb="enabled" ${st.p.enabled ? 'checked' : ''}> طلب بيانات المستفيد قبل البدء</label>
          <label class="f"><span>عنوان النموذج</span><input data-pt="title" value="${esc(st.p.title)}"></label>
          <div class="row"><label class="chk"><input type="checkbox" data-pb="name" ${st.p.name ? 'checked' : ''}> الاسم</label><label class="chk"><input type="checkbox" data-pb="phone" ${st.p.phone ? 'checked' : ''}> الجوال</label><label class="chk"><input type="checkbox" data-pb="email" ${st.p.email ? 'checked' : ''}> البريد</label></div>
          <small class="muted">الجوال يُستخدم لجلب بيانات المستفيد من قاعدة البيانات تلقائياً.</small></div>`,
      dashboard: () => {
        const d = st.dash, c = d[st.dashMode];
        const colorInput = (key, label) => `<label class="f"><span>${label}</span><div class="colorrow"><input type="color" data-dash-color="${key}" value="${esc(c[key])}"><code>${esc(c[key])}</code></div></label>`;
        return `<div class="card dash-custom"><h3>🖥️ تخصيص لوحة البرنامج</h3>
          <p class="muted">هذه الألوان والزخارف تخص لوحة التحكم على هذا المتصفح. لا تغيّر مظهر محادثات مواقع العملاء.</p>
          <div class="dash-mode"><b>تعديل ألوان الوضع ${st.dashMode === 'dark' ? 'الليلي' : 'النهاري'}</b><button class="btn sm" type="button" id="dash-switch-mode">التبديل إلى الوضع ${st.dashMode === 'dark' ? 'النهاري' : 'الليلي'} للتعديل</button></div>
          <div class="grid g2">${colorInput('bg', 'خلفية صفحات البرنامج')}${colorInput('panel', 'خلفية البطاقات والنوافذ')}${colorInput('text', 'لون النصوص')}${colorInput('sidebar', 'خلفية القائمة الجانبية')}${colorInput('sidebarText', 'نصوص القائمة الجانبية')}</div>
          <label class="f"><span>لون الأزرار والعناصر الرئيسية</span><div class="colorrow"><input type="color" data-dash-accent value="${esc(d.accent)}"><code>${esc(d.accent)}</code></div></label>
          <div class="grid g2">
            <label class="f"><span>الزخرفة الإسلامية للبرنامج</span><select data-dash-decoration><option value="none">بدون زخرفة</option><option value="geometric">نجوم هندسية</option><option value="arabesque">أرابيسك</option><option value="arabic_letters">حروف عربية</option></select></label>
            <label class="f"><span>خط واجهة البرنامج</span><select data-dash-font><option value="&quot;IBM Plex Sans Arabic&quot;,system-ui,Tahoma,sans-serif">IBM Plex Sans Arabic</option><option value="'Noto Sans Arabic',system-ui,sans-serif">Noto Sans Arabic</option><option value="'Noto Naskh Arabic',serif">Noto Naskh Arabic</option><option value="'Cairo',sans-serif">Cairo</option><option value="'Tajawal',sans-serif">Tajawal</option><option value="'Amiri',serif">Amiri — نسخي</option><option value="'Reem Kufi',sans-serif">Reem Kufi — كوفي</option><option value="'Aref Ruqaa',serif">Aref Ruqaa — رقعة</option><option value="'El Messiri',sans-serif">El Messiri</option><option value="Tahoma,sans-serif">Tahoma</option></select></label>
          </div>
          <div class="dash-samples" dir="rtl"><b>معاينة الحروف والزخارف</b><span>مرحباً بكم في لوحة التحكم — ١٢٣٤٥٦</span><span class="dash-arabic">ع ض م هـ</span></div>
          <div class="row dash-actions"><button class="btn pri" type="button" id="dash-save">💾 حفظ تخصيص البرنامج</button><button class="btn" type="button" id="dash-reset">استعادة الألوان الافتراضية</button><small class="muted">يُحفظ التخصيص في هذا المتصفح فقط.</small></div>
        </div>`;
      }
    };
    const TABS = [['identity', '🏢 الهوية'], ['colors', '🎨 ألوان المحادثة'], ['shapes', '🔘 الأشكال'], ['texts', '✍️ النصوص'], ['rating', '⭐ التقييم'], ['prechat', '📝 نموذج البداية'], ['dashboard', '🖥️ لوحة البرنامج']];

    $('#ct').innerHTML = `
      <div class="grid ap-layout">
        <div>
          <div class="ap-tabs">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}">${l}</button>`).join('')}</div>
          <div id="apbody"></div>
          <div class="ap-save"><span class="muted" id="dirty"></span><span class="sp"></span><button class="btn" id="revert">تراجع</button><button class="btn pri" id="apsave">💾 حفظ ونشر</button></div>
        </div>
        <div class="card ap-prev"><div class="row" style="padding:2px 4px 10px"><b>معاينة مباشرة</b><span class="muted" style="font-size:12px">تتحدث فوراً أثناء التعديل</span><span class="sp"></span><button class="btn sm" id="rl" title="إعادة تحميل">↻</button></div>
          <iframe class="preview-frame" id="pf"></iframe></div>
      </div>`;

    let pt;
    const pushPreview = () => {
      clearTimeout(pt);
      pt = setTimeout(() => { try { $('#pf').contentWindow.postMessage({ type: 'sc-preview', appearance: A, prechat: st.p }, location.origin); } catch { /* ignore */ } }, 120);
    };
    const markDirty = () => { st.dirty = true; $('#dirty').textContent = '● تغييرات غير محفوظة'; pushPreview(); };
    const loadPrev = () => { $('#pf').src = `/demo/preview.html?site=${encodeURIComponent(site().key)}&t=${Date.now()}`; $('#pf').onload = () => setTimeout(pushPreview, 600); };
    loadPrev(); $('#rl').onclick = loadPrev;

    const draw = () => {
      $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
      $('.ap-save').style.display = st.tab === 'dashboard' ? 'none' : 'flex';
      $('#apbody').innerHTML = tabs[st.tab]();
      const body = $('#apbody');
      $$('[data-s]', body).forEach(s => { s.value = String(A[s.dataset.s]); s.onchange = () => { A[s.dataset.s] = s.value === 'true' ? true : s.value === 'false' ? false : s.value; if (s.dataset.s === 'decoration_style') A.islamic_pattern = s.value !== 'none'; markDirty(); if (s.dataset.s === 'font') { const sample = $('#chat-font-sample', body); if (sample) sample.style.fontFamily = A.font || 'inherit'; } }; });
      $$('[data-t]', body).forEach(i => i.oninput = () => { A[i.dataset.t] = i.value; markDirty(); });
      $$('[data-b]', body).forEach(i => i.onchange = () => { A[i.dataset.b] = i.checked; markDirty(); });
      $$('[data-r]', body).forEach(i => i.oninput = () => { A[i.dataset.r] = Number(i.value); $(`[data-rv="${i.dataset.r}"]`, body).textContent = i.value; markDirty(); if (i.dataset.r === 'rating_max') rdemo(); });
      $$('[data-c]', body).forEach(i => i.oninput = () => { A[i.dataset.c] = i.value; i.style.opacity = 1; $(`[data-ct="${i.dataset.c}"]`, body).value = i.value; markDirty(); });
      $$('[data-ct]', body).forEach(i => i.oninput = () => { if (!i.value || /^#[0-9a-f]{6}$/i.test(i.value)) { A[i.dataset.ct] = i.value; if (i.value) $(`[data-c="${i.dataset.ct}"]`, body).value = i.value; markDirty(); } });
      $$('[data-auto]', body).forEach(b => b.onclick = () => { A[b.dataset.auto] = ''; draw(); markDirty(); });
      $$('[data-pal]', body).forEach(b => b.onclick = () => { Object.assign(A, PALETTES[b.dataset.pal].v); draw(); markDirty(); });
      $$('[data-shape]', body).forEach(b => b.onclick = () => { A.launcher_shape = b.dataset.shape; draw(); markDirty(); });
      $$('[data-ico]', body).forEach(b => b.onclick = () => { A.launcher_icon_preset = b.dataset.ico; A.launcher_icon = ''; draw(); markDirty(); });
      $$('[data-img]', body).forEach(inp => inp.onchange = async () => {
        if (!inp.files[0]) return;
        A[inp.dataset.img] = await readImage(inp.files[0], inp.dataset.img === 'company_logo' ? 400 : 256);
        draw(); markDirty();
      });
      $$('[data-clr]', body).forEach(b => b.onclick = () => { A[b.dataset.clr] = ''; draw(); markDirty(); });
      $$('[data-pb]', body).forEach(i => i.onchange = () => { st.p[i.dataset.pb] = i.checked; markDirty(); });
      $$('[data-pt]', body).forEach(i => i.oninput = () => { st.p[i.dataset.pt] = i.value; markDirty(); });
      const fontSample = $('#chat-font-sample', body); if (fontSample) fontSample.style.fontFamily = A.font || 'inherit';
      if (st.tab === 'dashboard') {
        const d = st.dash, colors = d[st.dashMode];
        $('[data-dash-decoration]', body).value = d.decoration;
        $('[data-dash-font]', body).value = d.font;
        $$('[data-dash-color]', body).forEach(inp => inp.oninput = () => {
          colors[inp.dataset.dashColor] = inp.value; inp.nextElementSibling.textContent = inp.value; applyDashboardPrefs(d);
        });
        $('[data-dash-accent]', body).oninput = (e) => { d.accent = e.target.value; e.target.nextElementSibling.textContent = d.accent; applyDashboardPrefs(d); };
        $('[data-dash-decoration]', body).onchange = (e) => { d.decoration = e.target.value; applyDashboardPrefs(d); };
        $('[data-dash-font]', body).onchange = (e) => { d.font = e.target.value; applyDashboardPrefs(d); $('.dash-samples', body).style.fontFamily = d.font; };
        $('#dash-switch-mode', body).onclick = () => {
          st.dashMode = st.dashMode === 'dark' ? 'light' : 'dark';
          document.body.dataset.theme = st.dashMode; localStorage.setItem(THEME_KEY, st.dashMode); applyDashboardPrefs(d);
          $('#theme-toggle').textContent = st.dashMode === 'dark' ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي'; draw();
        };
        $('#dash-save', body).onclick = () => { dashboardPrefs = JSON.parse(JSON.stringify(d)); localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboardPrefs)); applyDashboardPrefs(); ok('تم حفظ تخصيص لوحة البرنامج على هذا المتصفح'); };
        $('#dash-reset', body).onclick = () => {
          st.dash = JSON.parse(JSON.stringify(DASHBOARD_DEFAULTS)); dashboardPrefs = JSON.parse(JSON.stringify(st.dash));
          localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboardPrefs)); applyDashboardPrefs(); draw(); ok('تمت استعادة تخصيص لوحة البرنامج الافتراضي');
        };
        $('.dash-samples', body).style.fontFamily = d.font;
      }
      if (st.tab === 'rating') rdemo();
    };
    const rdemo = () => { const m = Number(A.rating_max) || 5; const el = $('#rdemo'); if (el) el.innerHTML = [0.5, m / 2, m - 1, m].map(v => `<div style="margin:4px 0">${stars(v, m)}</div>`).join(''); };
    $$('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; draw(); });
    $('#revert').onclick = () => { if (!st.dirty || confirm('تجاهل التغييرات غير المحفوظة؟')) renderAppearance(); };
    $('#apsave').onclick = async () => {
      await saveSite({ settings: { appearance: A, prechat: st.p } }, 'تم الحفظ — التغييرات ظاهرة الآن في كل المواقع');
      st.dirty = false; $('#dirty').textContent = '';
    };
    draw();
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
