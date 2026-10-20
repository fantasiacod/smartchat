/* Decorative background patterns (shared by server, widget and dashboard). */
(function (root) {
  var P = {
    none: { name: 'بدون', tile: 0 },
    huroof: { name: 'حروف عربية', asset: true },
    girih12: { name: 'نجمة اثنا عشرية (إسلامي)', asset: true },
    khatam: {
      name: 'نجمة ثمانية (إسلامي)', tile: 80,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.4">' +
          '<rect x="22" y="22" width="36" height="36"/><rect x="22" y="22" width="36" height="36" transform="rotate(45 40 40)"/>' +
          '<circle cx="40" cy="40" r="7"/><path d="M0 40h10M70 40h10M40 0v10M40 70v10"/>' +
          '<rect x="-8" y="-8" width="16" height="16" transform="rotate(45 0 0)"/><rect x="72" y="-8" width="16" height="16" transform="rotate(45 80 0)"/>' +
          '<rect x="-8" y="72" width="16" height="16" transform="rotate(45 0 80)"/><rect x="72" y="72" width="16" height="16" transform="rotate(45 80 80)"/></g>';
      }
    },
    hexagon: {
      name: 'سداسي', tile: 56, h: 97,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.4"><path d="M28 0 56 16v32L28 64 0 48V16z"/><path d="M28 64v33M0 16 -28 0M56 16 84 0"/><circle cx="28" cy="32" r="8"/></g>';
      }
    },
    sadu: {
      name: 'السدو السعودي', tile: 64,
      svg: function (c) {
        return '<g fill="' + c + '"><path d="M0 0h64v6H0zM0 58h64v6H0z"/><path d="M0 12 8 20 16 12 24 20 32 12 40 20 48 12 56 20 64 12v4l-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8z"/>' +
          '<path d="M32 26 42 32 32 38 22 32z"/><path d="M8 26 14 32 8 38 2 32zM56 26 62 32 56 38 50 32z"/>' +
          '<path d="M0 44 8 52 16 44 24 52 32 44 40 52 48 44 56 52 64 44v4l-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8z"/></g>';
      }
    },
    najdi: {
      name: 'نجدي (مثلثات)', tile: 48,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.3"><path d="M0 24 12 4 24 24 36 4 48 24M0 48 12 28 24 48 36 28 48 48"/><path d="M12 24v-8M36 24v-8M12 48v-8M36 48v-8"/></g>';
      }
    },
    arabesque: {
      name: 'أرابيسك (زخرفة نباتية)', tile: 88,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.3"><circle cx="44" cy="44" r="30"/><circle cx="44" cy="44" r="18"/>' +
          '<path d="M44 14c-6 14-14 22-30 30 16 8 24 16 30 30 6-14 14-22 30-30-16-8-24-16-30-30z"/>' +
          '<path d="M0 0c10 8 10 18 0 26M88 0c-10 8-10 18 0 26M0 88c10-8 10-18 0-26M88 88c-10-8-10-18 0-26"/></g>';
      }
    },
    girih: {
      name: 'جيريه (تداخل هندسي)', tile: 90,
      svg: function (c) {
        var pts = [], i, a;
        for (i = 0; i < 10; i++) { a = Math.PI / 5 * i - Math.PI / 2; var r = i % 2 ? 14 : 30; pts.push((45 + r * Math.cos(a)).toFixed(1) + ' ' + (45 + r * Math.sin(a)).toFixed(1)); }
        return '<g fill="none" stroke="' + c + '" stroke-width="1.3"><path d="M' + pts.join('L') + 'z"/><circle cx="45" cy="45" r="36"/><path d="M45 9V0M45 81v9M9 45H0M81 45h9"/><path d="M0 0l20 20M90 0 70 20M0 90l20-20M90 90 70 70"/></g>';
      }
    },
    mashrabiya: {
      name: 'مشربية', tile: 40,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.3"><circle cx="20" cy="20" r="9"/><path d="M20 0v11M20 29v11M0 20h11M29 20h11"/><circle cx="0" cy="0" r="6"/><circle cx="40" cy="0" r="6"/><circle cx="0" cy="40" r="6"/><circle cx="40" cy="40" r="6"/></g>';
      }
    },
    arches: {
      name: 'أقواس (محراب)', tile: 60, h: 70,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.4"><path d="M8 70V36C8 20 18 10 30 4c12 6 22 16 22 32v34"/><path d="M18 70V40c0-10 6-17 12-21 6 4 12 11 12 21v30"/><circle cx="30" cy="30" r="2" fill="' + c + '"/></g>';
      }
    },
    // occasions
    ramadan: {
      name: '🌙 رمضان', tile: 100, occasion: true,
      svg: function (c) {
        return '<g fill="' + c + '">' + crescent(28, 26, 12) + star4(76, 16, 4) + star4(16, 72, 3) + star4(46, 90, 3.5) + star5(52, 30, 3) + '<circle cx="88" cy="88" r="1.5"/><circle cx="8" cy="40" r="1.3"/></g>' +
          '<g fill="none" stroke="' + c + '" stroke-width="1.4" stroke-linejoin="round"><path d="M74 30v8"/><circle cx="74" cy="40" r="2"/><path d="M67 48h14l-3-5h-8z"/><path d="M67 48l-4 6v14l4 6h14l4-6V54l-4-6"/><path d="M68 54h12M68 68h12M74 54v14"/><path d="M70 74h8l-1 4h-6z"/></g>';
      }
    },
    eid: {
      name: '🎉 العيد', tile: 100, occasion: true,
      svg: function (c) {
        return '<g fill="' + c + '">' + crescent(26, 28, 13) + star5(36, 22, 3.6) + star4(80, 70, 4) + star4(12, 84, 3) + star4(58, 12, 2.6) +
          '<rect x="47" y="52" width="4" height="2" transform="rotate(30 49 53)"/><rect x="88" y="40" width="4" height="2" transform="rotate(-25 90 41)"/><rect x="30" y="62" width="3" height="2" transform="rotate(60 31 63)"/><circle cx="66" cy="94" r="1.5"/></g>' +
          '<g fill="none" stroke="' + c + '" stroke-width="1.4" stroke-linejoin="round"><rect x="56" y="68" width="18" height="16" rx="1.5"/><path d="M56 74h18M65 68v16"/><path d="M65 68c-3-5-9-4-7 0 1 2 5 1 7 0zM65 68c3-5 9-4 7 0-1 2-5 1-7 0z"/>' +
          '<ellipse cx="84" cy="22" rx="7" ry="9"/><path d="M84 31l-1.5 2h3zM84 33c-3 6 3 10 0 16"/></g>';
      }
    },
    national: {
      name: '🇸🇦 اليوم الوطني', tile: 100, occasion: true,
      svg: function (c) {
        return '<g fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linecap="round">' +
          '<path d="M30 80c1-12 0-24-2-38"/><path d="M27 72h4M27 64h4M27 56h4M27 48h3"/>' +
          '<path d="M28 42c-6-6-14-6-18-2M28 42c-4-9-12-12-17-10M28 42c2-9 9-13 16-11M28 42c6-5 14-4 18 1M28 42c0-8 3-14 8-16"/>' +
          '<path d="M10 86c12-6 28-6 40 0"/><path d="M58 92c10-5 22-5 32 0"/></g>' +
          '<g fill="' + c + '">' + star5(74, 22, 5) + star4(86, 56, 3.5) + star4(56, 50, 2.5) + star8(70, 74, 5) + '</g>';
      }
    },
    logo: { name: '🏷️ شعار الجهة', img: 'logo' },
    images: { name: '🖼️ صوري', img: 'images' },
    dots: {
      name: 'نقاط', tile: 22,
      svg: function (c) { return '<circle cx="11" cy="11" r="1.6" fill="' + c + '"/>'; }
    }
  };

  function crescent(x, y, r) { return '<path d="M' + x + ' ' + (y - r) + 'A' + r + ' ' + r + ' 0 1 0 ' + x + ' ' + (y + r) + 'A' + (r * 1.25) + ' ' + (r * 1.25) + ' 0 0 1 ' + x + ' ' + (y - r) + 'z"/>'; }
  function starN(x, y, r, n, k) { var d = ''; for (var i = 0; i < n * 2; i++) { var a = Math.PI * i / n - Math.PI / 2, rr = i % 2 ? r * k : r; d += (i ? 'L' : 'M') + (x + rr * Math.cos(a)).toFixed(2) + ' ' + (y + rr * Math.sin(a)).toFixed(2); } return '<path d="' + d + 'z"/>'; }
  function star4(x, y, r) { return starN(x, y, r, 4, 0.32); }
  function star5(x, y, r) { return starN(x, y, r, 5, 0.45); }
  function star8(x, y, r) { return starN(x, y, r, 8, 0.6); }

  // a tile made of pictures (organisation logo or the admin's own images); imgs = data: URLs
  function imagesSvg(imgs, color, opacity, scale, tint) {
    imgs = (imgs || []).filter(Boolean); if (!imgs.length) return '';
    var n = imgs.length, s = Number(scale) || 1, cell = 96 * s, size = cell * 0.52, cols = Math.max(2, n), w = cols * cell, h = 2 * cell;
    var op = Math.min(1, Math.max(0.03, (Number(opacity) || 0.08) * (tint ? 1.4 : 1.8)));
    var out = '';
    for (var r = 0; r < 2; r++) for (var i = 0; i < cols; i++) {
      var href = imgs[(i + r * Math.ceil(n / 2)) % n], x = i * cell + (r ? cell / 2 : 0) + (cell - size) / 2, y = r * cell + (cell - size) / 2, ang = (i + r) % 2 ? -10 : 10;
      [x, x - w].forEach(function (xx) { out += '<image href="' + href + '" x="' + xx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + size.toFixed(1) + '" height="' + size.toFixed(1) + '" preserveAspectRatio="xMidYMid meet" transform="rotate(' + ang + ' ' + (xx + size / 2).toFixed(1) + ' ' + (y + size / 2).toFixed(1) + ')"/>'; });
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + Math.round(w) + '" height="' + Math.round(h) + '" viewBox="0 0 ' + w.toFixed(1) + ' ' + h.toFixed(1) + '">' +
      (tint ? '<defs><filter id="t"><feFlood flood-color="' + color + '"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>' : '') +
      '<g opacity="' + op.toFixed(3) + '"' + (tint ? ' filter="url(#t)"' : '') + '>' + out + '</g></svg>';
  }

  // occasions by date (Saudi calendar): Ramadan, Eid al-Fitr, Eid al-Adha, National Day, Founding Day
  function occasionOf(date, on) {
    on = on || {}; date = date || new Date();
    var hj = {}; try { new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Riyadh' }).formatToParts(date).forEach(function (p) { hj[p.type] = Number(p.value); }); } catch (e) { /* no ICU */ }
    var g = {}; new Intl.DateTimeFormat('en', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Riyadh' }).formatToParts(date).forEach(function (p) { g[p.type] = Number(p.value); });
    if (on.eid !== false && ((hj.month === 10 && hj.day <= 4) || (hj.month === 12 && hj.day >= 9 && hj.day <= 13))) return 'eid';
    if (on.ramadan !== false && hj.month === 9) return 'ramadan';
    if (on.national !== false && g.month === 9 && g.day >= 20 && g.day <= 26) return 'national';
    if (on.founding !== false && g.month === 2 && g.day >= 20 && g.day <= 23) return 'national';
    return null;
  }

  function rgba(hex, a) {
    var h = String(hex || '#41b072').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) h = '41b072';
    return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')';
  }

  function svg(style, color, opacity, scale) {
    var p = P[style];
    if (!p || !p.svg) return '';
    var w = p.tile, h = p.h || p.tile, s = Number(scale) || 1;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w * s) + '" height="' + Math.round(h * s) + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      p.svg(rgba(color, Math.min(1, Math.max(0.02, Number(opacity) || 0.08)))) + '</svg>';
  }

  // image-based (traced) patterns are served by the server: /pattern/<id>.svg
  function assetUrl(style, color, opacity, scale, base) {
    var h = String(color || '#41b072').replace('#', '');
    return (base == null ? api.base : base) + '/pattern/' + style + '.svg?c=' + encodeURIComponent(h) + '&o=' + (Math.min(1, Math.max(0.02, Number(opacity) || 0.08))) + '&s=' + (Number(scale) || 1);
  }

  function css(style, color, opacity, scale, base) {
    if (P[style] && P[style].asset) return 'url("' + assetUrl(style, color, opacity, scale, base) + '")';
    var s = svg(style, color, opacity, scale);
    return s ? 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s) + '")' : 'none';
  }

  var list = Object.keys(P).map(function (k) { return { id: k, name: P[k].name, img: P[k].img || null, occasion: !!P[k].occasion }; });
  var api = { list: list, svg: svg, css: css, rgba: rgba, imagesSvg: imagesSvg, occasionOf: occasionOf, base: '' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SCPatterns = api;
})(this);
