// Eligibility calculator: a set of questions, calculations and "not eligible if…" rules,
// plus an optional entitlement amount formula. No AI, no code execution: formulas are parsed safely.
const { db, now } = require('./db');

/* ---------- safe arithmetic: numbers, variables, + - * / ( ), min() max() round() abs() ---------- */
class Missing extends Error {}
function evalExpr(src, vars) {
  const s = String(src ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/×/g, '*').replace(/÷/g, '/');
  let i = 0;
  const ws = () => { while (/\s/.test(s[i] || '')) i++; };
  const peek = () => { ws(); return s[i]; };
  function primary() {
    const c = peek();
    if (c === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('قوس ناقص'); i++; return v; }
    if (c === '-') { i++; return -primary(); }
    if (c === '+') { i++; return primary(); }
    let m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return Number(m[0]); }
    m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(s.slice(i));
    if (m) {
      i += m[0].length; const name = m[0];
      if (peek() === '(') {
        i++; const args = [];
        if (peek() !== ')') { args.push(expr()); while (peek() === ',') { i++; args.push(expr()); } }
        if (peek() !== ')') throw new Error('قوس ناقص'); i++;
        const F = { min: Math.min, max: Math.max, abs: Math.abs, round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, floor: Math.floor, ceil: Math.ceil };
        if (!F[name]) throw new Error('دالة غير معروفة: ' + name);
        return F[name](...args);
      }
      if (!(name in vars) || vars[name] === '' || vars[name] == null) throw new Missing(name);
      const v = Number(vars[name]);
      if (!Number.isFinite(v)) throw new Error('القيمة ليست رقماً: ' + name);
      return v;
    }
    throw new Error('صيغة غير صحيحة قرب: ' + s.slice(i, i + 10));
  }
  function term() { let v = primary(); for (;;) { const c = peek(); if (c === '*') { i++; v *= primary(); } else if (c === '/') { i++; const d = primary(); v = d === 0 ? 0 : v / d; } else return v; } }
  function expr() { let v = term(); for (;;) { const c = peek(); if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v; } }
  const v = expr(); ws();
  if (i < s.length) throw new Error('صيغة غير صحيحة قرب: ' + s.slice(i, i + 10));
  return v;
}

const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };

// answers {key: value} → variables (answers + "<key>_points" for choices + calculations)
function buildVars(p, answers) {
  const vars = {};
  for (const q of p.questions || []) {
    if (!(q.key in answers)) continue;
    const a = answers[q.key];
    vars[q.key] = a;
    if (q.type !== 'number') { const o = (q.options || []).find(x => x.label === a); vars[q.key + '_points'] = o ? (num(o.points) ?? 0) : 0; }
  }
  for (const c of p.calcs || []) { try { vars[c.key] = evalExpr(c.formula, vars); } catch { /* not computable yet */ } }
  return vars;
}

// a rule = "not eligible if <left> <op> <right>"; returns true/false, or null if it can't be decided yet
function ruleHits(r, vars) {
  if (!r.left || !r.op) return null;
  let L; try { L = evalExpr(r.left, vars); } catch (e) { if (e instanceof Missing) return null; L = vars[r.left]; if (L == null) return null; }
  let R = r.right;
  if (typeof L === 'number') { try { R = evalExpr(r.right, vars); } catch (e) { if (e instanceof Missing) return null; R = num(r.right); } }
  if (R == null) return null;
  const a = typeof L === 'number' && typeof R === 'number' ? L : String(L).trim(), b = typeof L === 'number' && typeof R === 'number' ? R : String(R).trim();
  switch (r.op) {
    case '>': return a > b; case '>=': return a >= b; case '<': return a < b; case '<=': return a <= b;
    case '=': return a === b; case '!=': return a !== b;
    default: return null;
  }
}

function evaluate(p, answers, { partial = false } = {}) {
  const vars = buildVars(p, answers);
  for (const r of p.rules || []) {
    const hit = ruleHits(r, vars);
    if (hit) return { done: true, eligible: false, reason: r.message || '', vars };
  }
  if (partial) return { done: false, vars };
  let amount = null;
  const A = p.amount || {};
  if (A.formula) {
    try {
      amount = evalExpr(A.formula, vars);
      if (num(A.min) != null) amount = Math.max(amount, num(A.min));
      if (num(A.max) != null) amount = Math.min(amount, num(A.max));
      amount = Math.round(amount * 10 ** (Number(A.round) || 0)) / 10 ** (Number(A.round) || 0);
      if (amount <= 0 && A.zero_not_eligible) return { done: true, eligible: false, reason: A.zero_message || '', vars, amount: 0 };
    } catch { amount = null; }
  }
  return { done: true, eligible: true, amount, vars };
}

// validates a typed / chosen answer; returns { value } or { error }
function parseAnswer(q, text, toLatin) {
  const raw = toLatin(String(text ?? '')).trim();
  if (q.type === 'number') {
    const n = num(raw.replace(/[\s,،]/g, '').replace(/(ريال|ر\.?س|sar|sr)$/i, ''));
    if (n == null) return { error: 'number' };
    if (num(q.min) != null && n < num(q.min)) return { error: 'range' };
    if (num(q.max) != null && n > num(q.max)) return { error: 'range' };
    return { value: n };
  }
  const opts = optionsOf(q);
  const k = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (k >= 1 && k <= opts.length) return { value: opts[k - 1].label };
  const norm = (x) => String(x).replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  const hit = opts.find(o => norm(o.label) === norm(raw)) || (q.type === 'yesno' && (/^(نعم|ايوه|أيوه|اي|yes|y|ہاں)$/i.test(raw) ? opts[0] : /^(لا|no|n|نہیں)$/i.test(raw) ? opts[1] : null));
  return hit ? { value: hit.label } : { error: 'choice' };
}
function optionsOf(q) {
  if (q.type === 'yesno') return [{ label: 'نعم', points: q.yes_points ?? 1 }, { label: 'لا', points: q.no_points ?? 0 }];
  return (q.options || []).filter(o => o && o.label);
}

function record(site, p, conv, res, answers) {
  db.prepare('INSERT INTO elig_results (site_id, program_id, conversation_id, eligible, amount, reason, answers, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(site.id, p.id, conv ? conv.id : null, res.eligible ? 1 : 0, res.amount ?? null, res.reason || '', JSON.stringify(answers), now());
}

module.exports = { evalExpr, evaluate, parseAnswer, optionsOf, record, Missing };
