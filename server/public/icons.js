/* Icon library + Saudi banks (shared by server, widget payloads and dashboard). 24×24 line icons. */
(function (root) {
  var I = {
    info: ['معلومات', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'],
    building: ['مبنى', '<path d="M4 21V5l8-3 8 3v16M2 21h20M9 21v-4h6v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/>'],
    mosque: ['مسجد', '<path d="M12 3c1 2 4 3 4 6H8c0-3 3-4 4-6zM6 21V11h12v10M2 21h20M4 21V9M20 21V9M10 21v-4a2 2 0 014 0v4"/>'],
    eye: ['رؤية', '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    flag: ['رسالة', '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'],
    target: ['أهداف', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
    star: ['نجمة', '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'],
    heart: ['قلب', '<path d="M12 20s-7-4.4-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.6-9 9-9 9z"/>'],
    hands: ['عطاء', '<path d="M3 14l4-3 4 1 4-1h3a2 2 0 010 4h-5M3 14v6h3l5 1 8-4M14 7a3 3 0 10-4 0l2 2z"/>'],
    users: ['مستفيدون', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>'],
    family: ['أسرة', '<circle cx="7" cy="6" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="12" cy="12" r="2"/><path d="M3 20v-5a4 4 0 018 0M13 20v-5a4 4 0 018 0M9.5 20v-2a2.5 2.5 0 015 0v2"/>'],
    home: ['منزل', '<path d="M3 11l9-7 9 7M5 9.5V21h14V9.5M10 21v-6h4v6"/>'],
    book: ['كتاب', '<path d="M4 4h6a2 2 0 012 2v14a2 2 0 00-2-2H4zM20 4h-6a2 2 0 00-2 2v14a2 2 0 012-2h6z"/>'],
    quran: ['مصحف', '<path d="M5 3h12a2 2 0 012 2v16H7a2 2 0 01-2-2zM5 19a2 2 0 012-2h12"/><path d="M12 7l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>'],
    school: ['تعليم', '<path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6"/>'],
    calendar: ['تقويم', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    clock: ['ساعة', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    phone: ['هاتف', '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>'],
    mail: ['بريد', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'],
    map: ['موقع', '<path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'],
    globe: ['موقع إلكتروني', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'],
    gift: ['هدية', '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10.5 3 8 4s0 4 4 4zm0 0s1.5-5 4-4 0 4-4 4z"/>'],
    money: ['تبرع', '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>'],
    bank: ['بنك', '<path d="M3 10l9-6 9 6M4 10h16M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M3 18h18"/>'],
    card: ['بطاقة', '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'],
    basket: ['سلة غذائية', '<path d="M3 10h18l-2 10H5zM8 10l3-6M16 10l-3-6M9 14v3M15 14v3"/>'],
    water: ['سقيا', '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>'],
    medical: ['صحة', '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>'],
    leaf: ['تنمية', '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15zM5 19l8-8"/>'],
    shield: ['حماية', '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'],
    award: ['إنجاز', '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 21l5-3 5 3-1.5-7"/>'],
    chart: ['إحصائيات', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    briefcase: ['عمل', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>'],
    volunteer: ['تطوع', '<circle cx="12" cy="6" r="3"/><path d="M6 21v-4a6 6 0 0112 0v4M9 14l3 3 3-3"/>'],
    bulb: ['فكرة', '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z"/>'],
    question: ['أسئلة', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 2-2.5 2.2-2.5 4M12 17v.01"/>'],
    list: ['قائمة', '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'],
    document: ['مستند', '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h7"/>'],
    link: ['رابط', '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'],
    camera: ['صور', '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>'],
    video: ['فيديو', '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>'],
    chat: ['محادثة', '<path d="M4 5h16v11H9l-5 4z"/>'],
    crescent: ['هلال', '<path d="M15 3a9 9 0 100 18 7 7 0 010-18z"/>'],
    palm: ['نخلة', '<path d="M12 21V10M12 10C9 6 5 6 3 8c3 0 6 1 9 2zm0 0c3-4 7-4 9-2-3 0-6 1-9 2zm0 0c-1-4-4-6-7-6 2 2 5 4 7 6zm0 0c1-4 4-6 7-6-2 2-5 4-7 6zM8 21h8"/>']
  };
  var BANKS = {
    rajhi: ['مصرف الراجحي', '#00529b'], snb: ['البنك الأهلي السعودي', '#00843d'], alinma: ['مصرف الإنماء', '#8b5e16'],
    albilad: ['بنك البلاد', '#e2a02b'], riyad: ['بنك الرياض', '#1d3f8b'], anb: ['البنك العربي الوطني', '#00664f'],
    sab: ['البنك السعودي الأول SAB', '#db0011'], aljazira: ['بنك الجزيرة', '#a6192e'], bsf: ['البنك السعودي الفرنسي', '#d1121b'],
    saib: ['البنك السعودي للاستثمار', '#0a4d8c'], gib: ['بنك الخليج الدولي', '#5b2c83'], stc: ['STC Bank', '#4f008c'],
    d360: ['D360 Bank', '#111827'], other: ['بنك آخر', '#475569']
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeColor(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : 'currentColor'; }
  function svg(id, color, size) {
    var i = I[id] || I.info, s = Number(size) || 22;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="' + safeColor(color) + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + i[1] + '</svg>';
  }
  var api = {
    list: Object.keys(I).map(function (k) { return { id: k, name: I[k][0] }; }),
    banks: Object.keys(BANKS).map(function (k) { return { id: k, name: BANKS[k][0], color: BANKS[k][1] }; }),
    bank: function (id) { var b = BANKS[id] || BANKS.other; return { id: BANKS[id] ? id : 'other', name: b[0], color: b[1] }; },
    has: function (id) { return !!I[id]; }, svg: svg, esc: esc, safeColor: safeColor
  };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SCIcons = api;
})(this);
