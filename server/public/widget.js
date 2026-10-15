/*! Smart Chat Agent widget — embed:
 *  <script src="https://YOUR-SERVER/widget.js" data-site="SITE_KEY" async></script>
 *  Optional (verified identity, e.g. from WordPress):
 *  window.SmartChatUser = { name, email, sig }   // sig = HMAC_SHA256(email, identity_secret)
 */
(function () {
  if (window.__smartChatLoaded) return;
  window.__smartChatLoaded = true;

  var script = document.currentScript || document.querySelector('script[data-site][src*="widget.js"]');
  if (!script) return;
  var BASE = new URL(script.src, location.href).origin;
  var SITE = script.getAttribute('data-site');
  var PREVIEW = script.hasAttribute('data-preview');
  var LS = 'smartchat_' + SITE + '_';
  var store = {
    get: function (k) { try { return localStorage.getItem(LS + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(LS + k, v); } catch (e) { } }
  };

  function loadIO(cb) {
    if (window.io) return cb();
    var s = document.createElement('script');
    s.src = BASE + '/socket.io/socket.io.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  fetch(BASE + '/api/widget/config?site=' + encodeURIComponent(SITE))
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (!cfg.error) loadIO(function () { init(cfg); }); });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(s) {
    return esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }
  function contrast(hex) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1f2937' : '#ffffff';
  }
  function time(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  var ICON_CHAT = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.3 1l.9 5.6c.1.5.5.8 1 .9l8 .9-8 .9c-.5.1-.9.4-1 .9l-.9 5.6c-.1.7.6 1.3 1.3 1z"/></svg>';
  var ICON_MENU = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';

  function init(cfg) {
    var A = cfg.appearance, P = cfg.prechat;
    if (A.hide_on_mobile && window.innerWidth < 600 && !PREVIEW) return;
    var color = A.primary_color || '#41b072', on = contrast(color);
    var side = A.position === 'left' ? 'left' : 'right';
    var rtl = A.dir !== 'ltr';
    var size = Number(A.launcher_size) || 64;

    var host = document.createElement('div');
    host.id = 'smart-chat-root';
    host.style.cssText = 'position:fixed;z-index:2147483000;' + side + ':' + (Number(A.offset_x) || 24) + 'px;bottom:' + (Number(A.offset_y) || 24) + 'px;';
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });

    root.innerHTML = '<style>' +
      ':host{all:initial}*{box-sizing:border-box;font-family:' + (A.font ? A.font + ',' : '') + 'system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif}' +
      '.wrap{position:relative;direction:' + (rtl ? 'rtl' : 'ltr') + ';display:flex;flex-direction:column;align-items:' + (side === 'right' ? 'flex-end' : 'flex-start') + '}' +
      '.launch-row{display:flex;align-items:center;gap:10px;flex-direction:' + (side === 'right' ? 'row' : 'row-reverse') + '}' +
      '.launcher{width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:0;cursor:pointer;background:' + color + ';color:' + on + ';display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.22);transition:transform .2s;position:relative;padding:0;overflow:hidden}' +
      '.launcher:hover{transform:scale(1.06)}.launcher img{width:100%;height:100%;object-fit:cover}' +
      '.badge{position:absolute;top:2px;' + (side === 'right' ? 'left' : 'right') + ':2px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:none;place-items:center;padding:0 5px;border:2px solid #fff}' +
      '.label{background:#fff;color:#111827;padding:9px 15px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.14);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}' +
      '.teaser{position:absolute;bottom:' + (size + 14) + 'px;' + side + ':0;background:#fff;color:#111827;padding:12px 34px 12px 14px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.16);font-size:14px;line-height:1.5;width:max-content;max-width:260px;cursor:pointer;animation:pop .3s ease}' +
      '.teaser .x{position:absolute;top:6px;' + (rtl ? 'left' : 'right') + ':8px;border:0;background:none;color:#9ca3af;cursor:pointer;font-size:16px}' +
      '.panel{position:absolute;bottom:' + (size + 14) + 'px;' + side + ':0;width:370px;height:min(600px,calc(100vh - ' + (size + 60) + 'px));background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;animation:pop .22s ease}' +
      '.panel.open{display:flex}@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}' +
      '.head{background:' + color + ';color:' + on + ';padding:16px;display:flex;align-items:center;gap:12px;position:relative}' +
      '.av{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.25);display:grid;place-items:center;overflow:hidden;flex:none}.av img{width:100%;height:100%;object-fit:cover}' +
      '.ht{flex:1;min-width:0}.ht b{display:block;font-size:16px}.ht span{font-size:12.5px;opacity:.9;display:flex;align-items:center;gap:6px}' +
      '.dot{width:8px;height:8px;border-radius:50%;background:#a7f3d0;display:inline-block}.dot.wait{background:#fde68a}' +
      '.hb{border:0;background:rgba(255,255,255,.18);color:inherit;width:34px;height:34px;border-radius:10px;cursor:pointer;display:grid;place-items:center}' +
      '.menu{position:absolute;top:58px;' + (rtl ? 'left' : 'right') + ':14px;background:#fff;color:#111827;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);display:none;z-index:3;min-width:170px;overflow:hidden}' +
      '.menu.open{display:block}.menu button{display:block;width:100%;border:0;background:none;padding:12px 16px;text-align:start;font-size:14px;cursor:pointer;color:#b91c1c}.menu button:hover{background:#fef2f2}' +
      '.body{flex:1;overflow-y:auto;padding:16px 14px;background:#f6f7f9;display:flex;flex-direction:column;gap:8px}' +
      '.row{display:flex;gap:8px;align-items:flex-end;max-width:88%}.row.me{align-self:flex-end;flex-direction:row-reverse}' +
      '.mav{width:28px;height:28px;border-radius:50%;background:' + color + ';color:' + on + ';display:grid;place-items:center;font-size:12px;font-weight:700;flex:none;overflow:hidden}.mav img{width:100%;height:100%;object-fit:cover}' +
      '.bub{padding:10px 13px;border-radius:16px;font-size:14.5px;line-height:1.6;word-wrap:break-word;overflow-wrap:anywhere;background:#fff;color:#111827;box-shadow:0 1px 2px rgba(0,0,0,.06)}' +
      '.row.me .bub{background:' + color + ';color:' + on + '}.bub a{color:inherit}' +
      '.who{font-size:11px;color:#6b7280;margin-bottom:3px}.tm{font-size:10.5px;opacity:.6;margin-top:3px}' +
      '.sys{align-self:center;background:#e5e7eb;color:#374151;font-size:12.5px;padding:6px 12px;border-radius:999px;text-align:center;max-width:92%}' +
      '.opts{display:flex;flex-wrap:wrap;gap:7px;margin:2px 36px 4px 0;' + (rtl ? '' : 'margin:2px 0 4px 36px;') + '}' +
      '.opt{border:1.5px solid ' + color + ';color:' + color + ';background:#fff;border-radius:999px;padding:7px 13px;font-size:13.5px;cursor:pointer;transition:.15s}' +
      '.opt:hover{background:' + color + ';color:' + on + '}.opt[disabled]{opacity:.45;cursor:default;background:#fff;color:' + color + '}' +
      '.link{display:inline-block;margin-top:6px;background:' + color + ';color:' + on + '!important;text-decoration:none;padding:6px 12px;border-radius:8px;font-size:13px}' +
      '.typing{display:none;align-self:flex-start;background:#fff;border-radius:16px;padding:10px 14px;gap:4px}.typing.on{display:flex}' +
      '.typing i{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bl 1.2s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}' +
      '@keyframes bl{0%,60%,100%{opacity:.3}30%{opacity:1}}' +
      '.foot{border-top:1px solid #eef0f3;padding:10px;display:flex;gap:8px;background:#fff}' +
      '.foot textarea{flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14.5px;resize:none;height:44px;max-height:110px;outline:none;color:#111827;background:#fff}' +
      '.foot textarea:focus{border-color:' + color + '}' +
      '.send{width:44px;height:44px;border:0;border-radius:12px;background:' + color + ';color:' + on + ';cursor:pointer;display:grid;place-items:center;flex:none}' +
      '.send svg{transform:' + (rtl ? 'scaleX(-1)' : 'none') + '}.send[disabled]{opacity:.5}' +
      '.screen{flex:1;overflow-y:auto;padding:22px 20px;display:flex;flex-direction:column;gap:12px;background:#fff}' +
      '.screen h3{margin:0 0 4px;font-size:17px;color:#111827;text-align:center}.screen p{margin:0;color:#6b7280;font-size:13.5px;text-align:center}' +
      '.screen input,.screen textarea{width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:11px 12px;font-size:14.5px;outline:none;color:#111827}' +
      '.screen input:focus,.screen textarea:focus{border-color:' + color + '}' +
      '.btn{border:0;border-radius:12px;background:' + color + ';color:' + on + ';padding:12px;font-size:15px;font-weight:600;cursor:pointer;width:100%}' +
      '.btn.ghost{background:#f3f4f6;color:#111827}' +
      '.stars{display:flex;justify-content:center;gap:4px;direction:ltr;margin:6px 0;flex-wrap:wrap}' +
      '.star{position:relative;width:38px;height:38px;cursor:pointer}.star>span{position:absolute;inset:0;display:block}.star svg{position:absolute;inset:0;width:100%;height:100%}' +
      '.star .bg path{fill:#e5e7eb}.star .fg{clip-path:inset(0 100% 0 0);transition:clip-path .08s}' +
      '.rv{text-align:center;font-weight:700;font-size:15px;min-height:22px}' +
      '.power{text-align:center;font-size:11px;color:#9ca3af;padding:0 0 8px;background:#fff}' +
      '@media (max-width:480px){.panel{position:fixed;inset:0;width:100%;height:100%;border-radius:0;bottom:0}.panel.open~.launch-row{display:none}}' +
      '</style>' +
      '<div class="wrap">' +
      '<div class="teaser" style="display:none"><button class="x" aria-label="close">×</button><span></span></div>' +
      '<div class="panel" role="dialog" aria-label="chat">' +
      '<div class="head"><div class="av">' + (A.bot_avatar ? '<img src="' + esc(A.bot_avatar) + '" alt="">' : ICON_CHAT) + '</div>' +
      '<div class="ht"><b>' + esc(A.title) + '</b><span><i class="dot"></i><em class="st" style="font-style:normal">' + esc(A.subtitle) + '</em></span></div>' +
      '<button class="hb mbtn" title="menu">' + ICON_MENU + '</button><button class="hb xbtn" title="close">' + ICON_CLOSE.replace(/26/g, '20') + '</button>' +
      '<div class="menu"><button class="endc">' + esc(A.end_label) + '</button></div></div>' +
      '<div class="view"></div>' +
      '</div>' +
      '<div class="launch-row">' + (A.launcher_label ? '<div class="label">' + esc(A.launcher_label) + '</div>' : '') +
      '<button class="launcher" aria-label="chat"><span class="li">' + (A.launcher_icon ? '<img src="' + esc(A.launcher_icon) + '" alt="">' : ICON_CHAT) + '</span><span class="badge">0</span></button></div>' +
      '</div>';

    var $ = function (s) { return root.querySelector(s); };
    var panel = $('.panel'), view = $('.view'), launcher = $('.launcher'), badge = $('.badge'), teaser = $('.teaser'), menu = $('.menu');
    var state = { open: false, unread: 0, status: null, agent: null, messages: [], hasConv: false, closed: false };
    var visitorId = store.get('vid');
    var socket = window.io(BASE + '/visitor', { transports: ['websocket', 'polling'] });

    function setLauncher() {
      $('.li').innerHTML = state.open ? ICON_CLOSE : (A.launcher_icon ? '<img src="' + esc(A.launcher_icon) + '" alt="">' : ICON_CHAT);
      badge.style.display = !state.open && state.unread ? 'grid' : 'none';
      badge.textContent = state.unread;
    }
    function toggle(force) {
      state.open = force === undefined ? !state.open : force;
      panel.classList.toggle('open', state.open);
      teaser.style.display = 'none';
      if (state.open) { state.unread = 0; render(); }
      setLauncher();
    }
    launcher.onclick = function () { toggle(); };
    if ($('.label')) $('.label').onclick = function () { toggle(true); };
    $('.xbtn').onclick = function () { toggle(false); };
    $('.mbtn').onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
    root.addEventListener('click', function () { menu.classList.remove('open'); });
    $('.endc').onclick = function () {
      if (!state.hasConv || state.closed) return toggle(false);
      if (confirm('هل تريد إنهاء المحادثة؟')) socket.emit('close', {});
    };
    teaser.querySelector('span').textContent = A.teaser || '';
    teaser.onclick = function (e) { if (e.target.classList.contains('x')) { teaser.style.display = 'none'; store.set('teaser', '1'); e.stopPropagation(); } else toggle(true); };
    if (A.teaser && !store.get('teaser')) setTimeout(function () { if (!state.open) teaser.style.display = 'block'; }, (Number(A.teaser_delay) || 4) * 1000);

    function statusText() {
      var st = $('.st'), dot = $('.dot');
      dot.classList.toggle('wait', state.status === 'waiting');
      if (state.status === 'waiting') st.textContent = 'بانتظار انضمام موظف...';
      else if (state.status === 'human') st.textContent = 'تتحدث مع ' + (state.agent || 'موظف');
      else if (state.status === 'closed') st.textContent = 'المحادثة منتهية';
      else st.textContent = A.subtitle || '';
    }

    /* ---------- views ---------- */
    function render() {
      statusText();
      $('.mbtn').style.display = state.hasConv && !state.closed ? '' : 'none';
      if (state.closed) return renderRating();
      if (!state.hasConv) return renderStart();
      renderChat();
    }

    function renderStart() {
      var html = '<div class="screen">';
      if (P.enabled) {
        html += '<h3>' + esc(P.title) + '</h3><form class="pf" style="display:flex;flex-direction:column;gap:10px">';
        if (P.name) html += '<input name="name" required placeholder="الاسم" autocomplete="name">';
        if (P.phone) html += '<input name="phone" required placeholder="رقم الجوال" inputmode="tel" autocomplete="tel">';
        if (P.email) html += '<input name="email" type="email" required placeholder="البريد الإلكتروني" autocomplete="email">';
        html += '<button class="btn" type="submit">' + esc(A.start_label) + '</button></form>';
      } else {
        html += '<div style="flex:1;display:grid;place-items:center"><div style="text-align:center">' +
          '<div style="width:72px;height:72px;margin:0 auto 14px;border-radius:50%;background:' + color + ';color:' + on + ';display:grid;place-items:center">' + ICON_CHAT + '</div>' +
          '<h3>' + esc(A.title) + '</h3><p>' + esc(A.teaser || A.subtitle) + '</p></div></div>' +
          '<button class="btn startb">' + esc(A.start_label) + '</button>';
      }
      html += '</div>';
      view.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
      view.innerHTML = html;
      var f = view.querySelector('.pf');
      if (f) f.onsubmit = function (e) {
        e.preventDefault();
        start({ name: f.name && f.name.value, phone: f.phone && f.phone.value, email: f.email && f.email.value });
      };
      var sb = view.querySelector('.startb');
      if (sb) sb.onclick = function () { start({}); };
    }

    function start(info) {
      info.page = location.href; info.lang = navigator.language;
      state.closed = false; state.messages = [];
      socket.emit('start', info);
    }

    function renderChat() {
      if (!view.querySelector('.body')) {
        view.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
        view.innerHTML = '<div class="body"></div><div class="foot"><textarea rows="1" placeholder="' + esc(A.placeholder) + '"></textarea><button class="send" aria-label="send">' + ICON_SEND + '</button></div>';
        var ta = view.querySelector('textarea'), sendB = view.querySelector('.send');
        var typingT;
        var send = function () {
          var t = ta.value.trim(); if (!t) return;
          socket.emit('message', { text: t }); ta.value = ''; ta.style.height = '44px';
          socket.emit('typing', { typing: false });
        };
        sendB.onclick = send;
        ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        ta.oninput = function () {
          ta.style.height = '44px'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
          socket.emit('typing', { typing: true }); clearTimeout(typingT);
          typingT = setTimeout(function () { socket.emit('typing', { typing: false }); }, 2000);
        };
      }
      var body = view.querySelector('.body');
      var lastOptIdx = -1;
      state.messages.forEach(function (m, i) { if (m.options && m.options.length) lastOptIdx = i; });
      var html = '';
      state.messages.forEach(function (m, i) {
        if (m.sender === 'system') { html += '<div class="sys">' + fmt(m.body) + '</div>'; return; }
        var me = m.sender === 'visitor';
        var who = m.sender === 'agent' ? (m.agent_name || 'موظف') : m.sender === 'bot' ? A.bot_name : '';
        var av = m.sender === 'bot' && A.bot_avatar ? '<img src="' + esc(A.bot_avatar) + '">' : esc((who || '?').trim().charAt(0));
        html += '<div class="row' + (me ? ' me' : '') + '">' + (me ? '' : '<div class="mav">' + av + '</div>') + '<div>' +
          (who ? '<div class="who">' + esc(who) + '</div>' : '') +
          '<div class="bub">' + fmt(m.body) + (m.link ? '<br><a class="link" href="' + esc(m.link) + '" target="_blank" rel="noopener">' + esc(m.link_label || 'فتح') + '</a>' : '') +
          '<div class="tm">' + time(m.created_at) + '</div></div></div></div>';
        if (m.options && m.options.length) {
          var active = i === lastOptIdx && state.status === 'bot' && i >= state.messages.length - 1;
          if (i === lastOptIdx && state.status === 'bot') {
            html += '<div class="opts">' + m.options.map(function (o) {
              return '<button class="opt" data-mid="' + m.id + '" data-i="' + o.i + '"' + (active ? '' : ' disabled') + '>' + esc(o.label) + '</button>';
            }).join('') + '</div>';
          }
        }
      });
      html += '<div class="typing"><i></i><i></i><i></i></div>';
      body.innerHTML = html;
      body.querySelectorAll('.opt:not([disabled])').forEach(function (b) {
        b.onclick = function () {
          body.querySelectorAll('.opt').forEach(function (x) { x.disabled = true; });
          socket.emit('option', { mid: Number(b.dataset.mid), i: Number(b.dataset.i) });
        };
      });
      body.scrollTop = body.scrollHeight;
    }

    function renderRating() {
      var max = Number(A.rating_max) || 5, value = 0, hover = 0;
      view.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
      if (state.rated) {
        view.innerHTML = '<div class="screen" style="justify-content:center"><div style="font-size:46px;text-align:center">🌟</div><h3>' + esc(A.rating_thanks) + '</h3>' +
          '<button class="btn newc" style="margin-top:14px">' + esc(A.new_chat_label) + '</button></div>';
        view.querySelector('.newc').onclick = function () { state.hasConv = false; state.closed = false; state.rated = false; render(); };
        return;
      }
      var stars = '';
      for (var i = 0; i < max; i++) stars += '<div class="star" data-i="' + i + '"><span class="bg">' + STAR + '</span><span class="fg">' + STAR + '</span></div>';
      view.innerHTML = '<div class="screen"><div style="font-size:15px;color:#6b7280;text-align:center">' + esc('تم إنهاء المحادثة') + '</div>' +
        '<h3>' + esc(A.rating_title) + '</h3><div class="stars">' + stars + '</div><div class="rv"></div>' +
        '<textarea rows="3" class="rc" placeholder="' + esc(A.rating_comment_placeholder) + '"></textarea>' +
        '<button class="btn rs" disabled style="opacity:.5">إرسال التقييم</button>' +
        '<button class="btn ghost newc">' + esc(A.new_chat_label) + '</button></div>';
      var els = view.querySelectorAll('.star'), rv = view.querySelector('.rv'), rs = view.querySelector('.rs');
      function colorFor(v) { var hue = max <= 0.5 ? 120 : Math.round(((v - 0.5) / (max - 0.5)) * 120); return 'hsl(' + hue + ',78%,' + (hue > 60 ? 40 : 50) + '%)'; }
      function paint(v) {
        var c = colorFor(v || 0.5);
        els.forEach(function (el, i) {
          var f = Math.max(0, Math.min(1, v - i));
          var fg = el.querySelector('.fg');
          fg.style.clipPath = 'inset(0 ' + (100 - f * 100) + '% 0 0)';
          fg.querySelector('path').style.fill = c;
        });
        rv.textContent = v ? (v + ' / ' + max) : '';
        rv.style.color = v ? c : '';
      }
      function valAt(el, e) {
        var r = el.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        return Number(el.dataset.i) + (x < r.width / 2 ? 0.5 : 1);
      }
      els.forEach(function (el) {
        el.onmousemove = function (e) { hover = valAt(el, e); paint(hover); };
        el.onclick = function (e) { value = valAt(el, e); paint(value); rs.disabled = false; rs.style.opacity = 1; };
      });
      view.querySelector('.stars').onmouseleave = function () { hover = 0; paint(value); };
      rs.onclick = function () {
        if (!value) return;
        socket.emit('rate', { rating: value, comment: view.querySelector('.rc').value }, function () { state.rated = true; render(); });
      };
      view.querySelector('.newc').onclick = function () { state.hasConv = false; state.closed = false; render(); };
      paint(0);
    }

    /* ---------- socket ---------- */
    socket.on('connect', function () {
      socket.emit('join', { site: SITE, visitorId: visitorId, user: window.SmartChatUser || null }, function (r) {
        if (!r || r.error) return;
        visitorId = r.visitorId; store.set('vid', visitorId);
        if (!r.hasConversation && !state.closed) { state.hasConv = false; if (state.open) render(); }
      });
    });
    socket.on('history', function (h) {
      state.hasConv = true; state.messages = h.messages;
      state.status = h.conversation.status; state.agent = h.conversation.agent_name;
      state.closed = h.conversation.status === 'closed'; state.rated = h.conversation.rating != null;
      if (state.open) render(); else statusText();
    });
    socket.on('message', function (m) {
      state.messages.push(m);
      if (state.open) renderChat(); else if (m.sender !== 'visitor') { state.unread++; setLauncher(); }
      var tp = root.querySelector('.typing'); if (tp) tp.classList.remove('on');
    });
    socket.on('status', function (s) { state.status = s.status; state.agent = s.agent_name; if (state.open && !state.closed) render(); else statusText(); });
    socket.on('typing', function (t) {
      var tp = root.querySelector('.typing'); if (!tp) return;
      tp.classList.toggle('on', !!t.typing);
      var b = root.querySelector('.body'); if (b) b.scrollTop = b.scrollHeight;
    });
    socket.on('closed', function () {
      state.closed = true; state.status = 'closed'; state.rated = false;
      if (state.open) render(); else { state.unread++; setLauncher(); }
    });

    window.SmartChat = { open: function () { toggle(true); }, close: function () { toggle(false); }, toggle: function () { toggle(); } };
    setLauncher();
    if (PREVIEW) toggle(true);
  }
})();
