// Statistics, agent reports and Excel exports.
const { db, getSite } = require('./db');

const secs = (a, b) => (a && b) ? Math.max(0, (new Date(b) - new Date(a)) / 1000) : null;
const avg = (arr) => { const v = arr.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const round = (x, d = 1) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;

function range(q) {
  const to = q.to ? new Date(q.to + 'T23:59:59') : new Date();
  const from = q.from ? new Date(q.from + 'T00:00:00') : new Date(to.getTime() - (Number(q.days) || 30) * 86400000);
  return { from: from.toISOString(), to: to.toISOString(), days: Math.max(1, Math.round((to - from) / 86400000)) };
}

function siteWhere(site, alias = '') {
  return site ? { sql: `${alias}site_id=?`, args: [Number(site)] } : { sql: '1=1', args: [] };
}

function dashboard(q) {
  const { from, to, days } = range(q);
  const sw = siteWhere(q.site);
  const convs = db.prepare(`SELECT * FROM conversations WHERE ${sw.sql} AND created_at>=? AND created_at<=?`).all(...sw.args, from, to);
  const handed = convs.filter(c => c.handoff_at);
  const closed = convs.filter(c => c.status === 'closed');
  const rated = convs.filter(c => c.rating != null);
  const tks = db.prepare(`SELECT * FROM tickets WHERE ${sw.sql} AND created_at>=? AND created_at<=?`).all(...sw.args, from, to);
  const site = q.site ? getSite(Number(q.site)) : null;
  const ratingMax = site?.settings.appearance.rating_max || 5;

  const dayKeys = [];
  for (let d = new Date(from); d <= new Date(to); d = new Date(d.getTime() + 86400000)) dayKeys.push(d.toISOString().slice(0, 10));
  const perDay = Object.fromEntries(dayKeys.map(k => [k, { d: k, total: 0, bot: 0, human: 0, tickets: 0 }]));
  for (const c of convs) { const k = c.created_at.slice(0, 10); if (perDay[k]) { perDay[k].total++; c.handoff_at ? perDay[k].human++ : perDay[k].bot++; } }
  for (const t of tks) { const k = t.created_at.slice(0, 10); if (perDay[k]) perDay[k].tickets++; }

  const byHour = Array(24).fill(0);
  for (const c of convs) byHour[(new Date(c.created_at).getUTCHours() + 3) % 24]++; // Riyadh time
  const count = (arr, key) => arr.reduce((m, x) => { const k = x[key] ?? 'none'; m[k] = (m[k] || 0) + 1; return m; }, {});

  const agentRows = (q._tenant ? db.prepare('SELECT u.id, u.name, u.avatar, u.job_title FROM users u WHERE u.site_id=?').all(Number(q._tenant)) : db.prepare('SELECT u.id, u.name, u.avatar, u.job_title FROM users u').all()).map(u => { // a store sees only its own employees
    const mine = handed.filter(c => c.assigned_to === u.id);
    return {
      id: u.id, name: u.name, avatar: u.avatar, title: u.job_title, conversations: mine.length,
      avg_rating: round(avg(mine.map(c => c.rating))), first_response: round(avg(mine.map(c => secs(c.handoff_at, c.first_response_at))), 0)
    };
  }).filter(a => a.conversations).sort((a, b) => b.conversations - a.conversations);

  const kb = db.prepare(`SELECT COUNT(*) total, SUM(source='learned') learned, COALESCE(SUM(hits),0) hits FROM kb WHERE ${sw.sql}`).get(...sw.args);
  const botAnswered = db.prepare(`SELECT COUNT(*) c FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${sw.sql.replace('site_id', 'c.site_id')} AND m.sender='bot' AND m.created_at>=? AND m.created_at<=?`).get(...sw.args, from, to).c;

  return {
    range: { from, to, days }, rating_max: ratingMax,
    kpi: {
      conversations: convs.length,
      bot_only: convs.filter(c => !c.handoff_at).length,
      handoffs: handed.length,
      automation_rate: convs.length ? round((1 - handed.length / convs.length) * 100) : null,
      avg_rating: round(avg(rated.map(c => c.rating)), 2), ratings: rated.length,
      satisfaction: rated.length ? round(rated.filter(c => c.rating >= ratingMax * 0.7).length / rated.length * 100) : null,
      first_response: round(avg(handed.map(c => secs(c.handoff_at, c.first_response_at))), 0),
      handle_time: round(avg(handed.filter(c => c.closed_at).map(c => secs(c.handoff_at, c.closed_at))), 0),
      active: db.prepare(`SELECT COUNT(*) c FROM conversations WHERE ${sw.sql} AND status!='closed'`).get(...sw.args).c,
      waiting: db.prepare(`SELECT COUNT(*) c FROM conversations WHERE ${sw.sql} AND status='waiting'`).get(...sw.args).c,
      tickets: tks.length, tickets_open: db.prepare(`SELECT COUNT(*) c FROM tickets WHERE ${sw.sql} AND status IN ('new','in_progress')`).get(...sw.args).c,
      bot_messages: botAnswered,
      unanswered_open: db.prepare(`SELECT COUNT(*) c FROM unanswered WHERE ${sw.sql} AND status='open'`).get(...sw.args).c
    },
    per_day: Object.values(perDay), by_hour: byHour,
    closed_by: count(closed, 'closed_by'), languages: count(convs, 'lang'),
    ratings: Object.entries(count(rated, 'rating')).map(([k, c]) => ({ k: Number(k), c })).sort((a, b) => a.k - b.k),
    tickets: { by_type: count(tks, 'type'), by_status: count(tks, 'status') },
    agents: agentRows,
    kb: { total: kb.total || 0, learned: kb.learned || 0, hits: kb.hits || 0 },
    top_kb: db.prepare(`SELECT id, question, hits FROM kb WHERE ${sw.sql} AND hits>0 ORDER BY hits DESC LIMIT 6`).all(...sw.args),
    top_unanswered: db.prepare(`SELECT id, question, count FROM unanswered WHERE ${sw.sql} AND status='open' ORDER BY count DESC, id DESC LIMIT 6`).all(...sw.args)
  };
}

// Per-agent performance report.
function agentReport(q) {
  const { from, to, days } = range(q);
  const ids = String(q.agents || '').split(',').map(Number).filter(Boolean);
  const users = (q._tenant ? db.prepare('SELECT id,name,email,role,job_title,avatar FROM users WHERE site_id=? ORDER BY name').all(Number(q._tenant)) : db.prepare('SELECT id,name,email,role,job_title,avatar FROM users ORDER BY name').all()).filter(u => !ids.length || ids.includes(u.id));
  const sw = siteWhere(q.site);
  const convs = db.prepare(`SELECT * FROM conversations WHERE ${sw.sql} AND handoff_at IS NOT NULL AND created_at>=? AND created_at<=?`).all(...sw.args, from, to);
  const msgs = db.prepare(`SELECT m.agent_id, m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ${sw.sql.replace('site_id', 'c.site_id')} AND m.sender='agent' AND m.created_at>=? AND m.created_at<=?`).all(...sw.args, from, to);
  const learned = db.prepare(`SELECT created_by, COUNT(*) c FROM kb WHERE ${sw.sql} AND source='learned' AND created_at>=? AND created_at<=? GROUP BY created_by`).all(...sw.args, from, to);
  const tev = db.prepare(`SELECT e.user_id, COUNT(DISTINCT e.ticket_id) c FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id WHERE ${sw.sql.replace('site_id', 't.site_id')} AND e.kind='updated' AND e.created_at>=? AND e.created_at<=? GROUP BY e.user_id`).all(...sw.args, from, to);
  const dayKeys = [];
  for (let d = new Date(from); d <= new Date(to); d = new Date(d.getTime() + 86400000)) dayKeys.push(d.toISOString().slice(0, 10));

  const rows = users.map(u => {
    const mine = convs.filter(c => c.assigned_to === u.id);
    const rated = mine.filter(c => c.rating != null);
    const daily = Object.fromEntries(dayKeys.map(k => [k, 0]));
    for (const c of mine) { const k = c.created_at.slice(0, 10); if (k in daily) daily[k]++; }
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, title: u.job_title, avatar: u.avatar,
      conversations: mine.length,
      closed: mine.filter(c => c.closed_by === 'agent' && c.closed_by_user === u.id).length,
      messages: msgs.filter(m => m.agent_id === u.id).length,
      avg_rating: round(avg(rated.map(c => c.rating)), 2), ratings: rated.length,
      first_response: round(avg(mine.map(c => secs(c.handoff_at, c.first_response_at))), 0),
      handle_time: round(avg(mine.filter(c => c.closed_at).map(c => secs(c.handoff_at, c.closed_at))), 0),
      learned: learned.find(l => l.created_by === u.id)?.c || 0,
      tickets: tev.find(t => t.user_id === u.id)?.c || 0,
      daily: dayKeys.map(k => daily[k])
    };
  });
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  return {
    range: { from, to, days }, days: dayKeys, rows,
    totals: {
      agents: rows.length, conversations: sum('conversations'), messages: sum('messages'), learned: sum('learned'), tickets: sum('tickets'),
      avg_rating: round(avg(convs.filter(c => rows.some(r => r.id === c.assigned_to)).map(c => c.rating)), 2),
      first_response: round(avg(convs.filter(c => rows.some(r => r.id === c.assigned_to)).map(c => secs(c.handoff_at, c.first_response_at))), 0)
    },
    conversations: convs.filter(c => rows.some(r => r.id === c.assigned_to))
  };
}

function ticketStats(q) {
  const { from, to } = range({ days: 3650, ...q });
  const sw = siteWhere(q.site);
  const rows = db.prepare(`SELECT * FROM tickets WHERE ${sw.sql} AND created_at>=? AND created_at<=? ORDER BY id DESC`).all(...sw.args, from, to);
  const months = {};
  for (const t of rows) { const k = t.created_at.slice(0, 7); months[k] = months[k] || { m: k, complaint: 0, suggestion: 0, inquiry: 0, callback: 0 }; months[k][t.type] = (months[k][t.type] || 0) + 1; }
  const resolved = rows.filter(t => t.resolved_at);
  const count = (key) => rows.reduce((m, x) => { m[x[key]] = (m[x[key]] || 0) + 1; return m; }, {});
  const days = Math.max(1, (new Date(to) - new Date(from)) / 86400000);
  return {
    total: rows.length, by_type: count('type'), by_status: count('status'), by_priority: count('priority'),
    per_month: Object.values(months).sort((a, b) => a.m.localeCompare(b.m)),
    avg_resolution_hours: round(avg(resolved.map(t => secs(t.created_at, t.resolved_at) / 3600)), 1),
    resolution_rate: rows.length ? round(resolved.length / rows.length * 100) : null,
    per_week: round(rows.length / (days / 7), 1)
  };
}

/* ---------------- Excel ---------------- */
const STATUS_AR = { new: 'جديدة', in_progress: 'قيد المعالجة', resolved: 'تم الحل', closed: 'مغلقة', rejected: 'مرفوضة' };
const TYPE_AR = { complaint: 'شكوى', suggestion: 'اقتراح', inquiry: 'استفسار', callback: 'طلب تواصل' };
const CONV_AR = { bot: 'مع البوت', waiting: 'بانتظار موظف', human: 'مع موظف', closed: 'مغلقة' };
const BY_AR = { visitor: 'المستفيد', agent: 'الموظف', system: 'النظام' };
const fmtDur = (s) => s == null ? '' : s < 60 ? `${Math.round(s)} ث` : s < 3600 ? `${Math.round(s / 60)} د` : `${round(s / 3600)} س`;
const dt = (iso) => iso ? new Date(iso) : null;

function styleSheet(ws, color, title, subtitle) {
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 4 }];
  ws.mergeCells(1, 1, 1, Math.max(4, ws.columnCount));
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
  ws.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'right' };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, Math.max(4, ws.columnCount));
  ws.getCell(2, 1).value = subtitle;
  ws.getCell(2, 1).font = { color: { argb: 'FF6B7280' } };
}

function addTable(ws, startRow, columns, rows, color) {
  const header = ws.getRow(startRow);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = c.width || 16;
  });
  header.height = 26;
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = typeof c.value === 'function' ? c.value(r) : r[c.key];
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { horizontal: c.align || 'right', vertical: 'top', wrapText: !!c.wrap };
      if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8F7' } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
    });
  });
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: columns.length } };
  return startRow + rows.length;
}

function dataBar(ws, col, from, to, color) {
  if (to <= from) return;
  const L = ws.getColumn(col).letter;
  ws.addConditionalFormatting({ ref: `${L}${from}:${L}${to}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF' + color }, gradient: true }] });
}

function kpiBlock(ws, row, items, color) {
  items.forEach((it, i) => {
    const c = i * 2 + 1;
    ws.mergeCells(row, c, row, c + 1); ws.mergeCells(row + 1, c, row + 1, c + 1);
    const a = ws.getCell(row, c), b = ws.getCell(row + 1, c);
    a.value = it[0]; a.font = { color: { argb: 'FF6B7280' }, size: 10 }; a.alignment = { horizontal: 'center' };
    b.value = it[1]; b.font = { bold: true, size: 18, color: { argb: 'FF' + color } }; b.alignment = { horizontal: 'center' };
    [a, b].forEach(x => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F4' } }; });
  });
  ws.getRow(row + 1).height = 30;
}

async function agentsExcel(q, color = '1A6739') {
  const ExcelJS = require('exceljs');
  const r = agentReport(q);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Smart Chat'; wb.created = new Date();
  const period = `الفترة: ${r.range.from.slice(0, 10)} إلى ${r.range.to.slice(0, 10)}`;

  const s = wb.addWorksheet('ملخص الأداء', { properties: { tabColor: { argb: 'FF' + color } } });
  s.columns = Array(12).fill({ width: 14 });
  styleSheet(s, color, 'تقرير أداء الموظفين', period);
  kpiBlock(s, 4, [['عدد الموظفين', r.totals.agents], ['المحادثات', r.totals.conversations], ['الرسائل', r.totals.messages], ['متوسط التقييم', r.totals.avg_rating ?? '—'], ['متوسط أول رد', fmtDur(r.totals.first_response) || '—'], ['إجابات متعلَّمة', r.totals.learned]], color);
  const cols = [
    { header: 'الموظف', key: 'name', width: 24 }, { header: 'المسمى', key: 'title', width: 18 },
    { header: 'المحادثات', key: 'conversations', align: 'center' }, { header: 'أغلقها', key: 'closed', align: 'center' },
    { header: 'الرسائل', key: 'messages', align: 'center' }, { header: 'متوسط التقييم', key: 'avg_rating', align: 'center' },
    { header: 'عدد التقييمات', key: 'ratings', align: 'center' }, { header: 'أول رد (ث)', key: 'first_response', align: 'center' },
    { header: 'مدة المعالجة (د)', value: (x) => x.handle_time == null ? null : round(x.handle_time / 60), align: 'center' },
    { header: 'إجابات متعلَّمة', key: 'learned', align: 'center' }, { header: 'شكاوى عالجها', key: 'tickets', align: 'center' }
  ];
  const end = addTable(s, 8, cols, r.rows, color);
  dataBar(s, 3, 9, end, color); dataBar(s, 6, 9, end, 'BC9525'); dataBar(s, 5, 9, end, '2563EB');

  const d = wb.addWorksheet('الأداء اليومي');
  d.columns = [{ width: 24 }, ...r.days.map(() => ({ width: 8 }))];
  styleSheet(d, color, 'المحادثات اليومية لكل موظف', period);
  const dcols = [{ header: 'الموظف', key: 'name', width: 24 }, ...r.days.map((k, i) => ({ header: k.slice(5), value: (x) => x.daily[i], align: 'center', width: 7 }))];
  const dend = addTable(d, 4, dcols, r.rows, color);
  if (dend > 4) d.addConditionalFormatting({ ref: `B5:${d.getColumn(r.days.length + 1).letter}${dend}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FF' + color }] }] });

  const c = wb.addWorksheet('المحادثات');
  styleSheet(c, color, 'تفاصيل المحادثات', period);
  const names = Object.fromEntries(r.rows.map(x => [x.id, x.name]));
  addTable(c, 4, [
    { header: '#', key: 'id', width: 8, align: 'center' }, { header: 'الموظف', value: (x) => names[x.assigned_to] || '', width: 20 },
    { header: 'المستفيد', key: 'visitor_name', width: 20 }, { header: 'الجوال', key: 'visitor_phone', width: 14 },
    { header: 'الحالة', value: (x) => CONV_AR[x.status] || x.status }, { header: 'أغلقها', value: (x) => BY_AR[x.closed_by] || '' },
    { header: 'التقييم', key: 'rating', align: 'center', width: 9 }, { header: 'ملاحظة التقييم', key: 'rating_comment', width: 30, wrap: true },
    { header: 'وقت التحويل', value: (x) => dt(x.handoff_at), numFmt: 'yyyy-mm-dd hh:mm', width: 18 },
    { header: 'أول رد', value: (x) => fmtDur(secs(x.handoff_at, x.first_response_at)), align: 'center' },
    { header: 'مدة المعالجة', value: (x) => fmtDur(secs(x.handoff_at, x.closed_at)), align: 'center' },
    { header: 'اللغة', key: 'lang', align: 'center', width: 8 }
  ], r.conversations, color);
  return wb.xlsx.writeBuffer();
}

async function ticketsExcel(q, color = '1A6739') {
  const ExcelJS = require('exceljs');
  const sw = siteWhere(q.site);
  const where = [sw.sql], args = [...sw.args];
  if (q.type) { where.push('t.type=?'); args.push(q.type); }
  if (q.status) { where.push('t.status=?'); args.push(q.status); }
  if (q.from) { where.push('t.created_at>=?'); args.push(q.from); }
  if (q.to) { where.push('t.created_at<=?'); args.push(q.to + 'T23:59:59'); }
  const rows = db.prepare(`SELECT t.*, u.name agent FROM tickets t LEFT JOIN users u ON u.id=t.assigned_to WHERE ${where.join(' AND ').replace(/(^|\s)site_id/, '$1t.site_id')} ORDER BY t.id DESC`).all(...args);
  const st = ticketStats(q);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Smart Chat';
  const period = q.from || q.to ? `الفترة: ${q.from || '...'} إلى ${q.to || '...'}` : 'كل الفترات';

  const s = wb.addWorksheet('الملخص', { properties: { tabColor: { argb: 'FF' + color } } });
  s.columns = Array(12).fill({ width: 14 });
  styleSheet(s, color, 'تقرير الشكاوى والاقتراحات', period);
  kpiBlock(s, 4, [['الإجمالي', st.total], ['الشكاوى', st.by_type.complaint || 0], ['الاقتراحات', st.by_type.suggestion || 0], ['نسبة الحل', st.resolution_rate == null ? '—' : st.resolution_rate + '%'], ['متوسط الحل (ساعة)', st.avg_resolution_hours ?? '—'], ['المعدل الأسبوعي', st.per_week ?? '—']], color);
  let end = addTable(s, 8, [{ header: 'الحالة', key: 'k', width: 20 }, { header: 'العدد', key: 'c', align: 'center' }],
    Object.entries(st.by_status).map(([k, c]) => ({ k: STATUS_AR[k] || k, c })), color);
  dataBar(s, 2, 9, end, color);
  const mStart = end + 3;
  end = addTable(s, mStart, [{ header: 'الشهر', key: 'm', width: 20 }, { header: 'شكاوى', key: 'complaint', align: 'center' }, { header: 'اقتراحات', key: 'suggestion', align: 'center' }, { header: 'استفسارات', key: 'inquiry', align: 'center' }], st.per_month, color);
  dataBar(s, 2, mStart + 1, end, 'DC2626'); dataBar(s, 3, mStart + 1, end, 'BC9525');

  const l = wb.addWorksheet('السجل');
  styleSheet(l, color, 'سجل الشكاوى والاقتراحات', period);
  addTable(l, 4, [
    { header: 'الرقم', key: 'number', width: 11, align: 'center' }, { header: 'النوع', value: (x) => TYPE_AR[x.type] || x.type, width: 10 },
    { header: 'الحالة', value: (x) => STATUS_AR[x.status] || x.status, width: 13 }, { header: 'الأولوية', key: 'priority', width: 10 },
    { header: 'الاسم', key: 'name', width: 20 }, { header: 'الجوال', key: 'phone', width: 14 }, { header: 'البريد', key: 'email', width: 22 },
    { header: 'النص', key: 'text', width: 50, wrap: true }, { header: 'الرد', key: 'reply', width: 40, wrap: true },
    { header: 'الموظف', key: 'agent', width: 16 }, { header: 'تاريخ التقديم', value: (x) => dt(x.created_at), numFmt: 'yyyy-mm-dd hh:mm', width: 18 },
    { header: 'تاريخ الحل', value: (x) => dt(x.resolved_at), numFmt: 'yyyy-mm-dd hh:mm', width: 18 },
    { header: 'مدة الحل (ساعة)', value: (x) => x.resolved_at ? round(secs(x.created_at, x.resolved_at) / 3600) : null, align: 'center' }
  ], rows, color);
  return wb.xlsx.writeBuffer();
}

module.exports = { dashboard, agentReport, ticketStats, agentsExcel, ticketsExcel, range };
