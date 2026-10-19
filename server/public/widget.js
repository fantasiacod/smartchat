/*! Smart Chat widget v2 — embed:
 *  <script src="https://YOUR-SERVER/widget.js" data-site="SITE_KEY" async></script>
 *  Optional verified identity: window.SmartChatUser = { name, email, sig }   // sig = HMAC_SHA256(email, identity_secret)
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
    s.src = BASE + '/socket.io/socket.io.min.js'; s.onload = cb;
    document.head.appendChild(s);
  }
  fetch(BASE + '/api/widget/config?site=' + encodeURIComponent(SITE))
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (!cfg.error) loadIO(function () { init(cfg); }); });

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(s) {
    return esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, '<br>');
  }
  function hex(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join(''); return /^[0-9a-f]{6}$/i.test(h) ? h : null; }
  function contrast(c) {
    var h = hex(c); if (!h) return '#ffffff';
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1f2937' : '#ffffff';
  }
  function abs(u) { return /^https?:/i.test(u) ? u : BASE + u; }
  function time(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function ytId(u) { var m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; }

  var ICONS = {
    chat: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>',
    dots: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3zM7.5 12.4a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm4.5 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm4.5 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z"/></svg>',
    square: '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M4 3h16a2 2 0 012 2v11a2 2 0 01-2 2H9l-4.6 3.5c-.5.4-1.4 0-1.4-.7V5a2 2 0 011-2z"/></svg>',
    headset: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2.5" y="13" width="4.5" height="7" rx="2" fill="currentColor"/><rect x="17" y="13" width="4.5" height="7" rx="2" fill="currentColor"/><path d="M19 20c0 1.5-2 2-5 2"/></svg>',
    help: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.3a2.8 2.8 0 015.4 1c0 1.9-2.7 2.4-2.7 4"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7zM19 15l1 2.7 2.7 1-2.7 1L19 22.5l-1-2.8-2.7-1 2.7-1z"/></svg>',
    wave: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1-.1 1.3-.6 2.6-1.6 3.6-.2.2 0 .6.3.6 1.9-.1 3.6-.8 4.9-1.8 1 .3 2 .4 3 .4 5.5 0 10-3.6 10-8S17.5 3 12 3z" opacity=".35"/><path d="M8 12.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="9.5" r="1.2"/><circle cx="15" cy="9.5" r="1.2"/></svg>',
    mosque: '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 2c.4 1.3 1.6 2 2.6 2.6C16.4 5.7 18 7.4 18 10H6c0-2.6 1.6-4.3 3.4-5.4C10.4 4 11.6 3.3 12 2zM5 11h14v9h-4v-4a3 3 0 00-6 0v4H5zM2 9h2v11H2zM20 9h2v11h-2z"/></svg>'
  };
  var I = {
    close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.3 1l.9 5.6c.1.5.5.8 1 .9l8 .9-8 .9c-.5.1-.9.4-1 .9l-.9 5.6c-.1.7.6 1.3 1.3 1z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#e11d48" d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"/><path fill="#fff" opacity=".5" d="M15 2v5h5z"/><text x="12" y="17" font-size="5.5" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">PDF</text></svg>',
    globe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>'
  };
  var FONTS = { 'Tajawal': 'Tajawal:wght@400;500;700', 'Cairo': 'Cairo:wght@400;600;700', 'IBM Plex Sans Arabic': 'IBM+Plex+Sans+Arabic:wght@400;500;600;700', 'Noto Kufi Arabic': 'Noto+Kufi+Arabic:wght@400;600;700', 'Noto Naskh Arabic': 'Noto+Naskh+Arabic:wght@400;600;700', 'Almarai': 'Almarai:wght@400;700', 'Readex Pro': 'Readex+Pro:wght@400;500;600;700', 'Amiri': 'Amiri:wght@400;700', 'El Messiri': 'El+Messiri:wght@400;600;700', 'Reem Kufi': 'Reem+Kufi:wght@400;600;700', 'Changa': 'Changa:wght@400;600;700', 'Lalezar': 'Lalezar', 'Noto Nastaliq Urdu': 'Noto+Nastaliq+Urdu:wght@400;700' };
  var current = null;
  window.__smartChatReinit = function (cfg) {
    if (current) { try { current.socket.disconnect(); } catch (e) { } current.host.remove(); current = null; }
    init(cfg, true);
  };

  /* ================================================================= */
  function init(cfg, reinit) {
    var A = cfg.appearance, P = cfg.prechat || {}, LG = cfg.languages || { enabled: ['ar'], default: 'ar', meta: { ar: { dir: 'rtl', name: 'العربية' } } };
    if (A.hide_on_mobile && window.innerWidth < 600 && !PREVIEW) return;
    var lang = store.get('lang');
    if (LG.enabled.indexOf(lang) < 0) {
      var nav = (navigator.language || '').slice(0, 2);
      lang = LG.enabled.indexOf(nav) >= 0 && nav !== 'en' ? nav : LG.default;
    }
    function T(k, ctx) { var s = (cfg.texts[lang] || cfg.texts[LG.default] || {})[k] || ''; return ctx ? s.replace(/\{(\w+)\}/g, function (_, x) { return ctx[x] == null ? '' : ctx[x]; }) : s; }
    function dirOf(l) { return (LG.meta[l] || {}).dir || 'rtl'; }

    var font = A.font || 'Tajawal';
    if (FONTS[font] && !document.querySelector('link[data-sc-font="' + font + '"]')) {
      var fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.setAttribute('data-sc-font', font);
      fl.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[font] + '&display=swap'; document.head.appendChild(fl);
    }
    if (lang === 'ur' && !document.querySelector('link[data-sc-font="Noto Nastaliq Urdu"]')) {
      var fu = document.createElement('link'); fu.rel = 'stylesheet'; fu.setAttribute('data-sc-font', 'Noto Nastaliq Urdu');
      fu.href = 'https://fonts.googleapis.com/css2?family=' + FONTS['Noto Nastaliq Urdu'] + '&display=swap'; document.head.appendChild(fu);
    }

    /* ---------- theme ---------- */
    var c1 = A.primary_color || '#1a6739', c2 = A.secondary_color || c1;
    var headBg = A.header_bg || c1, headCss = A.header_style === 'gradient' ? 'linear-gradient(135deg,' + headBg + ',' + c2 + ')' : headBg;
    var lBg = A.launcher_bg || c1, lCss = A.launcher_style === 'gradient' ? 'linear-gradient(135deg,' + lBg + ',' + c2 + ')' : lBg;
    var V = {
      c1: c1, c2: c2, on1: contrast(c1), head: headCss, headTxt: A.header_text || contrast(headBg),
      chat: A.chat_bg || '#f6f7f4', panel: A.panel_bg || '#fff', panelTxt: A.panel_text || '#111827',
      bot: A.bot_bubble_bg || '#fff', botTxt: A.bot_bubble_text || contrast(A.bot_bubble_bg || '#fff'),
      agent: A.agent_bubble_bg || A.bot_bubble_bg || '#fff', agentTxt: A.agent_bubble_text || A.bot_bubble_text || contrast(A.agent_bubble_bg || A.bot_bubble_bg || '#fff'),
      me: A.visitor_bubble_bg || c1, meTxt: A.visitor_bubble_text || contrast(A.visitor_bubble_bg || c1),
      sys: A.system_bg || '#eceee9', sysTxt: A.system_text || '#374151',
      opt: A.option_bg || '#fff', optTxt: A.option_text || c1, input: A.input_bg || '#fff', inputTxt: A.input_text || '#111827',
      foot: A.footer_bg || '#fff', footTxt: A.footer_color || '#9ca3af', av: A.avatar_bg || c1,
      launcher: lCss, lTxt: A.launcher_text || contrast(lBg), teaser: A.teaser_bg || '#fff', teaserTxt: A.teaser_text || '#111827',
      winR: (A.window_radius == null || A.window_radius === '' ? 18 : Number(A.window_radius)) + 'px',
      bubR: (A.bubble_radius == null || A.bubble_radius === '' ? 16 : Number(A.bubble_radius)) + 'px',
      fs: (Number(A.font_size) || 14.5) + 'px', winW: (Number(A.window_width) || 370) + 'px'
    };
    var side = A.position === 'left' ? 'left' : 'right';
    var size = Number(A.launcher_size) || 64, shape = A.launcher_shape || 'circle', pill = shape === 'pill';
    var lRad = shape === 'rounded' ? Math.round(size * 0.3) + 'px' : shape === 'square' ? '8px' : '999px';
    var launcherIcon = A.launcher_icon ? '<img src="' + esc(abs(A.launcher_icon)) + '" alt="">' : (ICONS[A.launcher_icon_preset] || ICONS.chat);
    var logo = A.company_logo ? abs(A.company_logo) : '';
    var orgName = (cfg.org && cfg.org.name) || A.company_name || '';
    var unified = A.show_unified_number !== false && cfg.org && cfg.org.unified_number;
    var pattern = A.pattern_chat !== false ? (A.pattern_css || 'none') : 'none';
    var headPattern = A.pattern_header !== false ? (A.pattern_header_css || 'none') : 'none';
    var optStyle = A.option_style || 'pill';

    var host = document.createElement('div');
    host.id = 'smart-chat-root';
    host.style.cssText = 'position:fixed;z-index:2147483000;' + side + ':' + (Number(A.offset_x) || 24) + 'px;bottom:' + (Number(A.offset_y) || 24) + 'px;';
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });

    var css =
      ':host{all:initial}*{box-sizing:border-box;font-family:"' + font + '",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}' +
      '.ur *{font-family:"Noto Nastaliq Urdu","' + font + '",Tahoma,sans-serif;line-height:2}' +
      '.wrap{position:relative;display:flex;flex-direction:column;align-items:' + (side === 'right' ? 'flex-end' : 'flex-start') + '}' +
      '.launch-row{display:flex;align-items:center;gap:10px;flex-direction:' + (side === 'right' ? 'row' : 'row-reverse') + '}' +
      '.launcher{height:' + size + 'px;min-width:' + size + 'px;' + (pill ? 'padding:0 22px 0 16px;' : 'width:' + size + 'px;padding:0;') + 'border-radius:' + lRad + ';border:0;cursor:pointer;background:' + V.launcher + ';color:' + V.lTxt + ';display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:transform .2s;position:relative;overflow:hidden;font-size:15px;font-weight:700}' +
      '.launcher:hover{transform:translateY(-2px) scale(1.04)}.launcher .li{display:grid;place-items:center;' + (pill ? 'width:30px;height:30px' : 'width:100%;height:100%') + '}.launcher img{width:100%;height:100%;object-fit:cover}' +
      '.badge{position:absolute;top:2px;' + (side === 'right' ? 'left' : 'right') + ':2px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:none;place-items:center;padding:0 5px;border:2px solid #fff}' +
      '.label{background:' + V.teaser + ';color:' + V.teaserTxt + ';padding:9px 15px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.14);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}' +
      '.teaser{position:absolute;bottom:' + (size + 14) + 'px;' + side + ':0;background:' + V.teaser + ';color:' + V.teaserTxt + ';padding:12px 34px 12px 14px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.16);font-size:14px;line-height:1.6;width:max-content;max-width:260px;cursor:pointer;animation:pop .3s ease}' +
      '.teaser .x{position:absolute;top:6px;inset-inline-end:8px;border:0;background:none;color:#9ca3af;cursor:pointer;font-size:16px}' +
      '.panel{position:absolute;bottom:' + (size + 14) + 'px;' + side + ':0;width:' + V.winW + ';height:min(640px,calc(100vh - ' + (size + 50) + 'px));background:' + V.panel + ';color:' + V.panelTxt + ';border-radius:' + V.winR + ';box-shadow:0 24px 60px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;animation:pop .22s ease}' +
      '.panel.open{display:flex}@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}' +
      '.head{background:' + V.head + ';color:' + V.headTxt + ';padding:14px 14px 16px;position:relative;flex:none}' +
      '.head:before{content:"";position:absolute;inset:0;background-image:' + headPattern + ';pointer-events:none}' +
      '.hrow{display:flex;align-items:center;gap:11px;position:relative}' +
      '.av{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;overflow:hidden;flex:none;border:2px solid rgba(255,255,255,.35)}.av img{width:100%;height:100%;object-fit:cover}' +
      '.av.logo{border-radius:12px;background:#fff;border:0}.av.logo img{object-fit:contain;padding:4px}' +
      '.ht{flex:1;min-width:0}.org{font-size:12px;opacity:.92;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ttl{display:block;font-size:16px;font-weight:700;line-height:1.35}' +
      '.sub{font-size:12px;opacity:.92;display:flex;align-items:center;gap:6px;margin-top:2px}' +
      '.dot{width:8px;height:8px;border-radius:50%;background:#86efac;display:inline-block;box-shadow:0 0 0 3px rgba(134,239,172,.25)}.dot.wait{background:#fde68a;animation:blink 1s infinite}.dot.off{background:#cbd5e1;box-shadow:none}' +
      '.uni{display:inline-flex;align-items:center;gap:5px;margin-top:8px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);color:inherit;text-decoration:none;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:700;direction:ltr;position:relative}' +
      '.hb{border:0;background:rgba(255,255,255,.18);color:inherit;width:34px;height:34px;border-radius:10px;cursor:pointer;display:grid;place-items:center;flex:none}' +
      '.langs{display:flex;gap:4px;position:relative;margin-top:8px;flex-wrap:wrap}.langs button{border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;border-radius:999px;padding:2px 10px;font-size:12px;cursor:pointer}.langs button.on{background:rgba(255,255,255,.95);color:' + c1 + ';font-weight:700}' +
      '.menu{position:absolute;top:56px;inset-inline-end:14px;background:' + V.panel + ';color:' + V.panelTxt + ';border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);display:none;z-index:5;min-width:180px;overflow:hidden}' +
      '.menu.open{display:block}.menu button{display:block;width:100%;border:0;background:none;padding:12px 16px;text-align:start;font-size:14px;cursor:pointer;color:inherit}.menu button:hover{background:rgba(0,0,0,.05)}.menu .danger{color:#b91c1c}' +
      '.view{flex:1;display:flex;flex-direction:column;min-height:0}' +
      '.body{flex:1;overflow-y:auto;padding:16px 12px;background-color:' + V.chat + ';background-image:' + pattern + ';display:flex;flex-direction:column;gap:8px}' +
      '.row{display:flex;gap:8px;align-items:flex-end;max-width:90%}.row.me{align-self:flex-end;flex-direction:row-reverse}' +
      '.mav{width:30px;height:30px;border-radius:50%;background:' + V.av + ';color:' + contrast(V.av) + ';display:grid;place-items:center;font-size:12px;font-weight:700;flex:none;overflow:hidden}.mav img{width:100%;height:100%;object-fit:cover}' +
      '.bub{padding:10px 13px;border-radius:' + V.bubR + ';font-size:' + V.fs + ';line-height:1.65;overflow-wrap:anywhere;box-shadow:0 1px 2px rgba(0,0,0,.07)}' +
      '.row.bot .bub{background:' + V.bot + ';color:' + V.botTxt + ';border-end-start-radius:4px}.row.agent .bub{background:' + V.agent + ';color:' + V.agentTxt + ';border-end-start-radius:4px}' +
      '.row.me .bub{background:' + V.me + ';color:' + V.meTxt + ';border-end-end-radius:4px}.bub a{color:inherit}' +
      '.who{font-size:11px;color:#6b7280;margin:0 4px 3px;display:flex;gap:5px;align-items:center}.who em{font-style:normal;opacity:.75}.tm{font-size:10.5px;opacity:.55;margin-top:3px}' +
      '.sys{align-self:center;background:' + V.sys + ';color:' + V.sysTxt + ';font-size:12.5px;padding:7px 14px;border-radius:14px;text-align:center;max-width:92%;line-height:1.6}' +
      '.opts{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 4px;padding-inline-start:38px}' +
      '.opts.list,.opts.card{flex-direction:column;align-items:stretch;padding-inline-end:20px}' +
      '.opt{border:1.5px solid ' + V.optTxt + ';color:' + V.optTxt + ';background:' + V.opt + ';border-radius:999px;padding:7px 13px;font-size:13.5px;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;gap:8px;text-align:start}' +
      '.opts.card .opt{border-radius:12px;padding:10px 12px;border-width:1px;box-shadow:0 1px 3px rgba(0,0,0,.06)}.opts.list .opt{border-radius:10px;border-width:1px}' +
      '.opt:hover{background:' + V.optTxt + ';color:' + contrast(V.optTxt) + '}.opt[disabled]{opacity:.45;cursor:default}.opt[disabled]:hover{background:' + V.opt + ';color:' + V.optTxt + '}' +
      '.num{min-width:22px;height:22px;border-radius:7px;background:' + c1 + ';color:' + V.on1 + ';display:grid;place-items:center;font-size:12px;font-weight:700;flex:none}' +
      '.opt:hover .num{background:' + V.on1 + ';color:' + c1 + '}' +
      '.link{display:inline-block;margin-top:8px;background:' + c1 + ';color:' + V.on1 + '!important;text-decoration:none;padding:7px 12px;border-radius:9px;font-size:13px;font-weight:600}' +
      '.att{display:flex;flex-direction:column;gap:8px;margin-top:8px}.att img{display:block;max-width:100%;max-height:260px;border-radius:10px;object-fit:cover;cursor:zoom-in}' +
      '.att video,.att iframe{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:#000}' +
      '.file{display:flex;align-items:center;gap:10px;border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:8px 10px;text-decoration:none;color:inherit!important;background:rgba(127,127,127,.06)}.file b{display:block;font-size:13px}.file small{opacity:.7;font-size:11.5px}' +
      '.map{margin-top:8px;border-radius:12px;overflow:hidden;border:1px solid rgba(127,127,127,.2);background:#e5e7eb}.map iframe{display:block;width:100%;height:170px;border:0}' +
      '.mapbtns{display:flex;gap:6px;padding:8px;background:' + V.panel + '}.mapbtns a{flex:1;text-align:center;text-decoration:none;font-size:12.5px;font-weight:700;padding:8px;border-radius:9px;background:' + c1 + ';color:' + V.on1 + '}.mapbtns a.alt{background:transparent;color:' + c1 + ';border:1px solid ' + c1 + '}' +
      '.card{display:flex;align-items:center;gap:8px;margin:-2px 0 8px;padding-bottom:8px;border-bottom:1px dashed rgba(127,127,127,.25)}.card .cic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--cc) 14%,transparent);overflow:hidden}.card .cic img{width:100%;height:100%;object-fit:contain;background:#fff}.card b{font-size:15px;color:var(--cc)}' +
      '.oic{display:inline-grid;place-items:center;width:20px;height:20px;flex:none}.oic svg{width:18px;height:18px}.opt:hover .oic svg{stroke:currentColor}' +
      '.banks{display:flex;flex-direction:column;gap:8px}.bank{border:1px solid rgba(127,127,127,.22);border-radius:12px;overflow:hidden;border-inline-start:5px solid var(--bc)}.bank .bh{padding:8px 10px;background:color-mix(in srgb,var(--bc) 9%,transparent)}.bank .bh b{display:block;font-size:13.5px;color:var(--bc)}.bank .bh small{font-size:11.5px;opacity:.8}' +
      '.bank .bl{display:flex;align-items:center;gap:6px;padding:7px 10px;border-top:1px solid rgba(127,127,127,.12);font-size:12px}.bank .bl span{opacity:.7;flex:none}.bank code{flex:1;font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:700;letter-spacing:.3px;overflow-wrap:anywhere;text-align:left}' +
      '.bank button{border:0;background:var(--bc);color:#fff;border-radius:7px;padding:4px 9px;font-size:11.5px;cursor:pointer;flex:none}.bank button.ok{background:#16a34a}.bank .bn{padding:6px 10px;font-size:11.5px;opacity:.8;border-top:1px solid rgba(127,127,127,.12)}' +
      '.contacts{display:flex;flex-direction:column;gap:6px;margin-top:8px}.ct{display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit!important;background:rgba(127,127,127,.07);border-radius:10px;padding:8px 10px}.ct span{flex:1;min-width:0}.ct small{display:block;opacity:.7;font-size:11px}.ct b{direction:ltr;unicode-bidi:isolate;font-size:13.5px}' +
      '.form{background:' + V.panel + ';color:' + V.panelTxt + ';border:1px solid rgba(127,127,127,.2);border-radius:14px;padding:12px;margin:0 0 4px;align-self:stretch;box-shadow:0 2px 10px rgba(0,0,0,.05)}' +
      '.form h4{margin:0 0 10px;font-size:15px;display:flex;align-items:center;gap:8px}.form h4:before{content:"";width:4px;height:18px;border-radius:2px;background:' + c1 + '}' +
      '.form input,.form textarea{width:100%;border:1px solid #d1d5db;border-radius:10px;padding:10px 11px;font-size:14px;outline:none;color:' + V.inputTxt + ';background:' + V.input + ';margin-bottom:4px}' +
      '.form textarea{min-height:90px;resize:vertical}.form input:focus,.form textarea:focus{border-color:' + c1 + ';box-shadow:0 0 0 3px ' + c1 + '22}' +
      '.form .err{color:#dc2626;font-size:11.5px;min-height:14px;margin-bottom:4px}.form .bad{border-color:#dc2626}' +
      '.form.done{opacity:.75}.form .okn{background:#ecfdf5;color:#065f46;border-radius:10px;padding:10px;font-size:13.5px;text-align:center;font-weight:700}' +
      '.ring{position:sticky;top:0;z-index:2;align-self:stretch;display:flex;align-items:center;gap:10px;background:' + V.panel + ';color:' + V.panelTxt + ';border:1px solid ' + c1 + '44;border-radius:14px;padding:10px 12px;box-shadow:0 6px 16px rgba(0,0,0,.08)}' +
      '.ring .ph{width:38px;height:38px;border-radius:50%;background:' + c1 + ';color:' + V.on1 + ';display:grid;place-items:center;flex:none;position:relative}' +
      '.ring .ph:before,.ring .ph:after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid ' + c1 + ';animation:wave 1.6s infinite}.ring .ph:after{animation-delay:.8s}' +
      '.ring .ph svg{animation:shake 1.2s infinite}.ring b{display:block;font-size:13.5px}.ring small{font-size:12px;opacity:.75}' +
      '@keyframes wave{from{transform:scale(1);opacity:.8}to{transform:scale(1.9);opacity:0}}@keyframes shake{0%,50%,100%{transform:rotate(0)}10%,30%{transform:rotate(-14deg)}20%,40%{transform:rotate(14deg)}}@keyframes blink{50%{opacity:.35}}' +
      '.typing{display:none;align-self:flex-start;background:' + V.bot + ';border-radius:16px;padding:10px 14px;gap:4px}.typing.on{display:flex}' +
      '.typing i{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bl 1.2s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}@keyframes bl{0%,60%,100%{opacity:.3}30%{opacity:1}}' +
      '.foot{border-top:1px solid rgba(127,127,127,.15);padding:10px;display:flex;gap:8px;background:' + V.panel + ';flex:none}' +
      '.foot textarea{flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14.5px;resize:none;height:44px;max-height:110px;outline:none;color:' + V.inputTxt + ';background:' + V.input + '}.foot textarea:focus{border-color:' + c1 + '}' +
      '.send{width:44px;height:44px;border:0;border-radius:12px;background:' + c1 + ';color:' + V.on1 + ';cursor:pointer;display:grid;place-items:center;flex:none}' +
      '.screen{flex:1;overflow-y:auto;padding:22px 20px;display:flex;flex-direction:column;gap:12px;background-color:' + V.panel + ';background-image:' + pattern + '}' +
      '.screen h3{margin:0 0 2px;font-size:18px;text-align:center}.screen p{margin:0;color:#6b7280;font-size:13.5px;text-align:center;line-height:1.7}' +
      '.screen input,.screen textarea{width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:11px 12px;font-size:14.5px;outline:none;color:' + V.inputTxt + ';background:' + V.input + '}.screen input:focus,.screen textarea:focus{border-color:' + c1 + '}' +
      '.btn{border:0;border-radius:12px;background:' + c1 + ';color:' + V.on1 + ';padding:12px;font-size:15px;font-weight:700;cursor:pointer;width:100%}.btn.ghost{background:rgba(127,127,127,.12);color:inherit}' +
      '.hero{flex:1;display:grid;place-items:center;text-align:center}.hero .lg{width:84px;height:84px;margin:0 auto 14px;border-radius:24px;background:' + V.launcher + ';color:' + V.lTxt + ';display:grid;place-items:center;box-shadow:0 10px 24px rgba(0,0,0,.15)}' +
      '.hero .lg img{max-width:150px;max-height:80px;object-fit:contain}.hero .lg.img{background:none;box-shadow:none;width:auto;height:auto}' +
      '.stars{display:flex;justify-content:center;gap:4px;direction:ltr;margin:6px 0;flex-wrap:wrap}.star{position:relative;width:38px;height:38px;cursor:pointer}.star>span{position:absolute;inset:0;display:block}.star svg{position:absolute;inset:0;width:100%;height:100%}' +
      '.star .bg path{fill:#e5e7eb}.star .fg{clip-path:inset(0 100% 0 0);transition:clip-path .08s}.rv{text-align:center;font-weight:700;font-size:15px;min-height:22px}' +
      '.power{text-align:center;font-size:11px;color:' + V.footTxt + ';padding:5px 0 7px;background:' + V.foot + ';border-top:1px solid rgba(127,127,127,.1);flex:none}.power b{font-weight:700}' +
      (PREVIEW ? '' : '@media (max-width:480px){.panel{position:fixed;inset:0;width:100%;height:100%;border-radius:0}.panel.open~.launch-row{display:none}}');

    root.innerHTML = '<style>' + css + '</style><div class="wrap"><div class="teaser" style="display:none"><button class="x" aria-label="close">×</button><span></span></div>' +
      '<div class="panel" role="dialog" aria-label="chat"><div class="head"></div><div class="view"></div>' +
      (orgName && A.show_footer !== false ? '<div class="power">' + esc(A.footer_text || '') + ' <b>' + esc(orgName) + '</b></div>' : '') + '</div>' +
      '<div class="launch-row">' + (A.launcher_label && !pill ? '<div class="label"></div>' : '') +
      '<button class="launcher" aria-label="chat"><span class="li">' + launcherIcon + '</span>' + (pill ? '<span class="lt"></span>' : '') + '<span class="badge">0</span></button></div></div>';

    var $ = function (s) { return root.querySelector(s); };
    var panel = $('.panel'), view = $('.view'), launcher = $('.launcher'), badge = $('.badge'), teaser = $('.teaser'), head = $('.head');
    var state = { open: false, unread: 0, status: null, agent: null, messages: [], hasConv: false, closed: false, rated: false, queue: 0, agentsOnline: 1 };
    var visitorId = store.get('vid');
    var socket = window.io(BASE + '/visitor', { transports: ['websocket', 'polling'] });
    current = { socket: socket, host: host };

    function applyLang() {
      var d = dirOf(lang);
      root.querySelector('.wrap').setAttribute('dir', d);
      root.querySelector('.wrap').classList.toggle('ur', lang === 'ur');
      if ($('.label')) $('.label').textContent = A.launcher_label || '';
      if ($('.lt')) $('.lt').textContent = A.launcher_label || T('start');
      teaser.querySelector('span').textContent = T('teaser');
      renderHead();
    }

    function renderHead() {
      var off = cfg.work && cfg.work.enabled && !cfg.work.open;
      var sub = state.status === 'waiting' ? T('waiting') : state.status === 'human' ? T('with_agent', { agent: state.agent || '' }) : state.status === 'closed' ? T('ended') : off ? T('off_hours_status') : T('subtitle');
      var avatar = logo ? '<div class="av logo"><img src="' + esc(logo) + '" alt=""></div>' : '<div class="av">' + (A.bot_avatar ? '<img src="' + esc(abs(A.bot_avatar)) + '" alt="">' : ICONS[A.launcher_icon_preset] || ICONS.chat) + '</div>';
      head.innerHTML = '<div class="hrow">' + avatar + '<div class="ht">' + (orgName ? '<span class="org">' + esc(orgName) + '</span>' : '') +
        '<span class="ttl">' + esc(T('title')) + '</span><span class="sub"><i class="dot' + (state.status === 'waiting' ? ' wait' : off ? ' off' : '') + '"></i>' + esc(sub) + '</span></div>' +
        '<button class="hb mbtn" title="menu">' + I.menu + '</button><button class="hb xbtn" title="close">' + I.close + '</button></div>' +
        (unified ? '<a class="uni" href="tel:' + esc(String(cfg.org.unified_number).replace(/\s/g, '')) + '">' + I.phone + esc(cfg.org.unified_number) + '</a>' : '') +
        (LG.show_switcher ? '<div class="langs">' + LG.enabled.map(function (l) { return '<button data-l="' + l + '" class="' + (l === lang ? 'on' : '') + '">' + esc((LG.meta[l] || {}).name || l) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="menu">' + (state.hasConv && !state.closed ? '<button class="endc danger">' + esc(T('end_chat')) + '</button>' : '') + '<button class="newc">' + esc(T('new_chat')) + '</button></div>';
      head.querySelector('.xbtn').onclick = function () { toggle(false); };
      var menu = head.querySelector('.menu');
      head.querySelector('.mbtn').onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
      var endc = head.querySelector('.endc');
      if (endc) endc.onclick = function () { if (confirm(T('confirm_end'))) socket.emit('close', {}); };
      head.querySelector('.newc').onclick = function () {
        if (state.hasConv && !state.closed) { if (!confirm(T('confirm_end'))) return; socket.emit('close', {}); }
        state.hasConv = false; state.closed = false; state.rated = false; render();
      };
      head.querySelectorAll('.langs button').forEach(function (b) {
        b.onclick = function () {
          lang = b.getAttribute('data-l'); store.set('lang', lang);
          socket.emit('lang', { lang: lang });
          applyLang(); render();
        };
      });
    }

    function setLauncher() {
      $('.li').innerHTML = state.open ? I.close : launcherIcon;
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
    root.addEventListener('click', function () { var m = root.querySelector('.menu'); if (m) m.classList.remove('open'); });
    teaser.onclick = function (e) { if (e.target.classList.contains('x')) { teaser.style.display = 'none'; store.set('teaser', '1'); e.stopPropagation(); } else toggle(true); };
    if (T('teaser') && !store.get('teaser') && !reinit) setTimeout(function () { if (!state.open) teaser.style.display = 'block'; }, (Number(A.teaser_delay) || 4) * 1000);

    /* ---------- views ---------- */
    function render() {
      renderHead();
      if (state.closed) return renderRating();
      if (!state.hasConv) return renderStart();
      renderChat();
    }

    function renderStart() {
      var html = '<div class="screen">';
      if (P.enabled) {
        html += '<h3>' + esc(P.title || T('prechat_title')) + '</h3><form class="pf" style="display:flex;flex-direction:column;gap:10px">';
        if (P.name) html += '<input name="name" required placeholder="' + esc(T('f_name')) + '" autocomplete="name">';
        if (P.phone) html += '<input name="phone" required placeholder="' + esc(T('f_phone')) + '" inputmode="tel" autocomplete="tel" dir="ltr">';
        if (P.email) html += '<input name="email" type="email" required placeholder="' + esc(T('f_email')) + '" autocomplete="email" dir="ltr">';
        html += '<button class="btn" type="submit">' + esc(T('start')) + '</button></form>';
      } else {
        html += '<div class="hero"><div>' + (logo ? '<div class="lg img"><img src="' + esc(logo) + '" alt=""></div>' : '<div class="lg">' + (ICONS[A.launcher_icon_preset] || ICONS.chat) + '</div>') +
          '<h3>' + esc(orgName || T('title')) + '</h3><p>' + esc(T('teaser') || T('subtitle')) + '</p></div></div>' +
          '<button class="btn startb">' + esc(T('start')) + '</button>';
      }
      view.innerHTML = html + '</div>';
      var f = view.querySelector('.pf');
      if (f) f.onsubmit = function (e) { e.preventDefault(); start({ name: f.name && f.name.value, phone: f.phone && f.phone.value, email: f.email && f.email.value }); };
      var sb = view.querySelector('.startb'); if (sb) sb.onclick = function () { start({}); };
    }
    function start(info) {
      info.page = location.href; info.lang = lang; info.browser_lang = navigator.language;
      state.closed = false; state.messages = [];
      socket.emit('start', info);
    }

    function mediaHTML(list) {
      return (list || []).map(function (f) {
        var url = abs(f.url), name = esc(f.name || '');
        if (f.type === 'image') return '<a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="' + name + '" loading="lazy"></a>';
        if (f.type === 'video') return '<video controls playsinline preload="metadata" src="' + esc(url) + '"></video>';
        if (f.type === 'youtube' || ytId(url)) { var id = ytId(url); if (id) return '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '" allowfullscreen loading="lazy" title="' + name + '"></iframe>'; }
        if (f.type === 'pdf') return '<a class="file" href="' + esc(url) + '" target="_blank" rel="noopener">' + I.pdf + '<span><b>' + (name || 'PDF') + '</b><small>' + esc(T('open_file')) + '</small></span></a>';
        return '<a class="file" href="' + esc(url) + '" target="_blank" rel="noopener">🔗<span><b>' + (name || esc(url)) + '</b><small>' + esc(T('open_link')) + '</small></span></a>';
      }).join('');
    }
    function locationHTML(l) {
      return '<div class="map">' + (l.embed ? '<iframe src="' + esc(l.embed) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="map"></iframe>' : '') +
        '<div class="mapbtns"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(T('open_maps')) + '</a>' +
        (l.directions ? '<a class="alt" href="' + esc(l.directions) + '" target="_blank" rel="noopener">' + esc(T('directions')) + '</a>' : '') + '</div></div>';
    }
    function contactsHTML(list) {
      return '<div class="contacts">' + list.map(function (c) {
        return '<a class="ct" href="' + esc(c.href || '#') + '" target="_blank" rel="noopener"><i>' + esc(c.icon || '') + '</i><span>' + (c.label ? '<small>' + esc(c.label) + '</small>' : '') + '<b>' + esc(c.value) + '</b></span></a>';
      }).join('') + '</div>';
    }
    function cardHTML(c) {
      var col = /^#[0-9a-f]{3,8}$/i.test(c.color || '') ? c.color : c1;
      return '<div class="card" style="--cc:' + col + '"><span class="cic">' + (c.logo ? '<img src="' + esc(abs(c.logo)) + '" alt="">' : (c.svg || '')) + '</span><b>' + esc(c.title || '') + '</b></div>';
    }
    function banksHTML(b) {
      var col = /^#[0-9a-f]{3,8}$/i.test(b.group.color || '') ? b.group.color : c1;
      return '<div class="banks"><div class="card" style="--cc:' + col + '"><span class="cic">' + (b.group.svg || '') + '</span><b>' + esc(b.group.name) + '</b></div>' + b.accounts.map(function (a) {
        var ac = /^#[0-9a-f]{3,8}$/i.test(a.color || '') ? a.color : '#475569';
        return '<div class="bank" style="--bc:' + ac + '"><div class="bh"><b>' + esc(a.bank) + '</b>' + (a.holder ? '<small>' + esc(a.holder) + '</small>' : '') + '</div>' +
          (a.iban ? '<div class="bl"><span>' + esc(T('iban')) + '</span><code dir="ltr">' + esc(a.iban.replace(/(.{4})/g, '$1 ').trim()) + '</code><button type="button" data-copy="' + esc(a.iban) + '">' + esc(T('copy') || 'Copy') + '</button></div>' : '') +
          (a.number ? '<div class="bl"><span>' + esc(T('account_no')) + '</span><code dir="ltr">' + esc(a.number) + '</code><button type="button" data-copy="' + esc(a.number) + '">' + esc(T('copy') || 'Copy') + '</button></div>' : '') +
          (a.note ? '<div class="bn">' + esc(a.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    function formHTML(m) {
      var f = m.form;
      if (f.submitted) return '<div class="form done"><h4>' + esc(f.title) + '</h4><div class="okn">✓ ' + esc(f.submitted) + '</div></div>';
      return '<form class="form" data-mid="' + m.id + '"><h4>' + esc(f.title) + '</h4>' +
        '<input name="name" placeholder="' + esc(T('f_name')) + '" value="' + esc(f.name || '') + '" autocomplete="name"><div class="err" data-e="name"></div>' +
        '<input name="phone" placeholder="' + esc(T('f_phone')) + '" value="' + esc(f.phone || '') + '" inputmode="tel" autocomplete="tel" dir="ltr"><div class="err" data-e="phone"></div>' +
        (f.type === 'callback' ? '<input type="hidden" name="email" value=""><input type="hidden" name="text" value="">' :
        '<input name="email" type="email" placeholder="' + esc(f.require_email ? T('f_email').replace(/\s*\(.*\)/, '') : T('f_email')) + '" value="' + esc(f.email || '') + '" autocomplete="email" dir="ltr"><div class="err" data-e="email"></div>' +
        '<textarea name="text" placeholder="' + esc(T('f_message')) + '"></textarea><div class="err" data-e="text"></div>') +
        '<button class="btn" type="submit">' + esc(T('f_send')) + '</button></form>';
    }

    function renderChat() {
      if (!view.querySelector('.body')) {
        view.innerHTML = '<div class="body"></div><div class="foot"><textarea rows="1"></textarea><button class="send" aria-label="send">' + I.send + '</button></div>';
        var ta = view.querySelector('textarea'), typingT;
        var send = function () {
          var t = ta.value.trim(); if (!t) return;
          state.pinned = true; socket.emit('message', { text: t }); ta.value = ''; ta.style.height = '44px';
          socket.emit('typing', { typing: false });
        };
        view.querySelector('.send').onclick = send;
        view.querySelector('.body').addEventListener('scroll', function () { var b = this; state.pinned = b.scrollHeight - b.scrollTop - b.clientHeight < 120; });
        ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        ta.oninput = function () {
          ta.style.height = '44px'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
          socket.emit('typing', { typing: true, text: ta.value }); clearTimeout(typingT);
          typingT = setTimeout(function () { socket.emit('typing', { typing: false }); }, 2000);
        };
      }
      var ta2 = view.querySelector('textarea');
      ta2.placeholder = T('placeholder'); ta2.disabled = state.closed;
      var body = view.querySelector('.body');
      var drafts = {}, focused = root.activeElement && root.activeElement.closest && root.activeElement.closest('form.form') ? [root.activeElement.closest('form.form').getAttribute('data-mid'), root.activeElement.name] : null;
      body.querySelectorAll('form.form').forEach(function (f) { drafts[f.getAttribute('data-mid')] = { name: f.name.value, phone: f.phone.value, email: f.email.value, text: f.text.value }; });
      var keepScroll = state.pinned === false ? body.scrollTop : null;
      var lastOptIdx = -1;
      state.messages.forEach(function (m, i) { if (m.options && m.options.length) lastOptIdx = i; });
      var html = state.status === 'waiting' ? '<div class="ring"><div class="ph">' + I.phone.replace(/14/g, '18') + '</div><div><b>' + esc(T('waiting')) + '</b><small>' +
        (state.queue > 1 ? esc(T('queue', { n: state.queue })) : '') + '</small></div></div>' : '';
      state.messages.forEach(function (m, i) {
        if (m.sender === 'system') { html += '<div class="sys">' + fmt(m.body) + '</div>'; return; }
        var me = m.sender === 'visitor';
        var cls = me ? 'me' : m.sender === 'agent' ? 'agent' : 'bot';
        var who = m.sender === 'agent' ? (m.agent_name || '') : m.sender === 'bot' ? T('bot_name') : '';
        var avImg = m.sender === 'agent' ? m.agent_avatar : (A.bot_avatar || A.company_logo);
        var av = avImg ? '<img src="' + esc(abs(avImg)) + '" alt=""' + (m.sender === 'bot' && !A.bot_avatar ? ' style="object-fit:contain;background:#fff;padding:2px"' : '') + '>' : m.sender === 'bot' ? (ICONS[A.launcher_icon_preset] || ICONS.chat).replace(/width="\d+" height="\d+"/, 'width="17" height="17"') : esc((who || '?').trim().charAt(0));
        var extra = (m.link ? '<br><a class="link" href="' + esc(m.link) + '" target="_blank" rel="noopener">' + esc(m.link_label || T('open_link')) + '</a>' : '') +
          (m.media ? '<div class="att">' + mediaHTML(m.media) + '</div>' : '') + (m.location ? locationHTML(m.location) : '') + (m.contacts ? contactsHTML(m.contacts) : '') + (m.banks ? banksHTML(m.banks) : '');
        var card = m.card ? cardHTML(m.card) : '';
        if (m.body || extra || card) {
          html += '<div class="row ' + cls + '">' + (me ? '' : '<div class="mav">' + av + '</div>') + '<div style="min-width:0">' +
            (who ? '<div class="who">' + esc(who) + (m.agent_title ? ' <em>· ' + esc(m.agent_title) + '</em>' : '') + '</div>' : '') +
            '<div class="bub" dir="auto">' + card + fmt(m.body || '') + extra + '<div class="tm">' + time(m.created_at) + '</div></div></div></div>';
        }
        if (m.form) html += formHTML(m);
        if (m.options && m.options.length && i === lastOptIdx && state.status === 'bot') {
          var active = i >= state.messages.length - 1 || !state.messages.slice(i + 1).some(function (x) { return x.sender === 'visitor'; });
          html += '<div class="opts ' + optStyle + '">' + m.options.map(function (o, k) {
            return '<button class="opt" data-mid="' + m.id + '" data-i="' + o.i + '"' + (active ? '' : ' disabled') + '>' + (m.numbered ? '<span class="num">' + (k + 1) + '</span>' : '') + (o.icon ? '<span class="oic">' + o.icon + '</span>' : '') + '<span>' + esc(o.label) + '</span></button>';
          }).join('') + '</div>';
        }
      });
      html += '<div class="typing"><i></i><i></i><i></i></div>';
      body.innerHTML = html;
      body.querySelectorAll('[data-copy]').forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute('data-copy'), done = function () { var o = b.textContent; b.textContent = T('copied') || '✓'; b.classList.add('ok'); setTimeout(function () { b.textContent = o; b.classList.remove('ok'); }, 1600); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () { fallback(); });
          else fallback();
          function fallback() { var t = document.createElement('textarea'); t.value = v; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { } t.remove(); done(); }
        };
      });
      body.querySelectorAll('.opt:not([disabled])').forEach(function (b) {
        b.onclick = function () {
          body.querySelectorAll('.opt').forEach(function (x) { x.disabled = true; }); state.pinned = true;
          socket.emit('option', { mid: Number(b.getAttribute('data-mid')), i: Number(b.getAttribute('data-i')) });
        };
      });
      body.querySelectorAll('form.form').forEach(function (f) {
        var d = drafts[f.getAttribute('data-mid')];
        if (d) Object.keys(d).forEach(function (k) { if (d[k]) f[k].value = d[k]; });
        if (focused && focused[0] === f.getAttribute('data-mid') && f[focused[1]]) f[focused[1]].focus();
        f.onsubmit = function (e) {
          e.preventDefault();
          var values = { name: f.name.value, phone: f.phone.value, email: f.email.value, text: f.text.value };
          f.querySelectorAll('.err').forEach(function (x) { x.textContent = ''; });
          f.querySelectorAll('.bad').forEach(function (x) { x.classList.remove('bad'); });
          var btn = f.querySelector('button'); btn.disabled = true;
          socket.emit('form_submit', { mid: Number(f.getAttribute('data-mid')), values: values }, function (r) {
            btn.disabled = false;
            if (r && r.fields) Object.keys(r.fields).forEach(function (k) {
              var el = f.querySelector('[data-e="' + k + '"]'); if (el) el.textContent = r.fields[k] === 'invalid' && k === 'phone' ? T('f_phone_invalid') : T('f_required');
              if (f[k]) f[k].classList.add('bad');
            });
          });
        };
      });
      body.scrollTop = keepScroll == null ? body.scrollHeight : keepScroll;
    }

    function renderRating() {
      var max = Number(A.rating_max) || 5, value = 0;
      if (state.rated) {
        view.innerHTML = '<div class="screen" style="justify-content:center"><div style="font-size:46px;text-align:center">🌟</div><h3>' + esc(T('rating_thanks')) + '</h3><button class="btn newc2" style="margin-top:14px">' + esc(T('new_chat')) + '</button></div>';
        view.querySelector('.newc2').onclick = function () { state.hasConv = false; state.closed = false; state.rated = false; render(); };
        return;
      }
      var stars = '';
      for (var i = 0; i < max; i++) stars += '<div class="star" data-i="' + i + '"><span class="bg">' + I.star + '</span><span class="fg">' + I.star + '</span></div>';
      view.innerHTML = '<div class="screen"><p>' + esc(T('ended')) + '</p><h3>' + esc(T('rating_title')) + '</h3><div class="stars">' + stars + '</div><div class="rv"></div>' +
        '<textarea rows="3" class="rc" placeholder="' + esc(T('rating_comment')) + '"></textarea><button class="btn rs" disabled style="opacity:.5">' + esc(T('rating_send')) + '</button>' +
        '<button class="btn ghost newc2">' + esc(T('new_chat')) + '</button></div>';
      var els = view.querySelectorAll('.star'), rv = view.querySelector('.rv'), rs = view.querySelector('.rs');
      function colorFor(v) { var hue = max <= 0.5 ? 120 : Math.round(((v - 0.5) / (max - 0.5)) * 120); return 'hsl(' + hue + ',78%,' + (hue > 60 ? 40 : 50) + '%)'; }
      function paint(v) {
        var c = colorFor(v || 0.5);
        els.forEach(function (el, i) { var f = Math.max(0, Math.min(1, v - i)); var fg = el.querySelector('.fg'); fg.style.clipPath = 'inset(0 ' + (100 - f * 100) + '% 0 0)'; fg.querySelector('path').style.fill = c; });
        rv.textContent = v ? (v + ' / ' + max) : ''; rv.style.color = v ? c : '';
      }
      function valAt(el, e) { var r = el.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; return Number(el.getAttribute('data-i')) + (x < r.width / 2 ? 0.5 : 1); }
      els.forEach(function (el) {
        el.onmousemove = function (e) { paint(valAt(el, e)); };
        el.onclick = function (e) { value = valAt(el, e); paint(value); rs.disabled = false; rs.style.opacity = 1; };
      });
      view.querySelector('.stars').onmouseleave = function () { paint(value); };
      rs.onclick = function () { if (value) socket.emit('rate', { rating: value, comment: view.querySelector('.rc').value }, function () { state.rated = true; render(); }); };
      view.querySelector('.newc2').onclick = function () { state.hasConv = false; state.closed = false; render(); };
      paint(0);
    }

    /* ---------- socket ---------- */
    socket.on('connect', function () {
      socket.emit('join', { site: SITE, visitorId: visitorId, lang: lang, user: window.SmartChatUser || null }, function (r) {
        if (!r || r.error) return;
        visitorId = r.visitorId; store.set('vid', visitorId);
        if (!r.hasConversation && !state.closed) { state.hasConv = false; if (state.open) render(); }
      });
    });
    socket.on('history', function (h) {
      state.hasConv = true; state.messages = h.messages; state.status = h.conversation.status; state.agent = h.conversation.agent_name;
      state.queue = h.conversation.queue || 0; state.closed = h.conversation.status === 'closed'; state.rated = h.conversation.rating != null;
      if (h.conversation.lang && LG.enabled.indexOf(h.conversation.lang) >= 0 && h.conversation.lang !== lang) { lang = h.conversation.lang; applyLang(); }
      if (state.open) render(); else renderHead();
    });
    socket.on('message', function (m) {
      state.messages.push(m);
      if (state.open && !state.closed) renderChat(); else if (m.sender !== 'visitor') { state.unread++; setLauncher(); }
    });
    socket.on('form_done', function (d) {
      state.messages.forEach(function (m) { if (m.id === d.mid && m.form) m.form.submitted = d.number; });
      if (state.open) renderChat();
    });
    socket.on('status', function (s) {
      state.status = s.status; state.agent = s.agent_name; state.queue = s.queue || 0;
      if (state.open && !state.closed) render(); else renderHead();
    });
    socket.on('typing', function (t) { var tp = root.querySelector('.typing'); if (!tp) return; tp.classList.toggle('on', !!t.typing); var b = root.querySelector('.body'); if (b) b.scrollTop = b.scrollHeight; });
    socket.on('closed', function () { state.closed = true; state.status = 'closed'; state.rated = false; if (state.open) render(); else { state.unread++; setLauncher(); } });

    window.SmartChat = { open: function () { toggle(true); }, close: function () { toggle(false); }, toggle: function () { toggle(); }, setLanguage: function (l) { if (LG.enabled.indexOf(l) >= 0) { lang = l; store.set('lang', l); socket.emit('lang', { lang: l }); applyLang(); render(); } } };
    applyLang(); setLauncher();
    if (PREVIEW) toggle(true);
  }
})();
