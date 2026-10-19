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
    dots: {
      name: 'نقاط', tile: 22,
      svg: function (c) { return '<circle cx="11" cy="11" r="1.6" fill="' + c + '"/>'; }
    }
  };

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

  var list = Object.keys(P).map(function (k) { return { id: k, name: P[k].name }; });
  var api = { list: list, svg: svg, css: css, rgba: rgba, base: '' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SCPatterns = api;
})(this);
