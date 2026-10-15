// Lightweight Arabic/English text matching for the knowledge base.
const STOP = new Set(('في من على عن الى إلى ما ماذا هل هو هي انا أنا انت أنت كيف كم متى لماذا وش ايش شو اللي الذي التي هذا هذه ذلك او أو ثم لو يا لا مع عند كان يكون ممكن ابي ابغى ابغا اريد أريد ودي '
  + 'the a an is are was do does how what when where why can i you to of in on for my me please').split(/\s+/).map(normalize));

function toLatinDigits(s) {
  return String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

function normalize(s) {
  return toLatinDigits(s).toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function stem(w) {
  if (w.length > 4 && (w.startsWith('وال') || w.startsWith('بال') || w.startsWith('فال') || w.startsWith('كال'))) w = w.slice(3);
  else if (w.length > 3 && w.startsWith('ال')) w = w.slice(2);
  if (w.length > 4 && /(ات|ون|ين|ها|هم|كم|نا)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && /[هي]$/.test(w)) w = w.slice(0, -1);
  return w;
}

function tokens(s) {
  return normalize(s).split(' ').filter(w => w && !STOP.has(w)).map(stem).filter(w => w.length > 1);
}

function tokenMatch(a, b) {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.8;
  return 0;
}

// Dice-like similarity with partial token matches.
function similarity(q, k) {
  const A = [...new Set(tokens(q))], B = [...new Set(tokens(k))];
  if (!A.length || !B.length) return normalize(q) === normalize(k) ? 1 : 0;
  let m = 0;
  for (const a of A) { let best = 0; for (const b of B) best = Math.max(best, tokenMatch(a, b)); m += best; }
  return (2 * m) / (A.length + B.length);
}

function containsPhrase(text, phrase) {
  const t = ' ' + normalize(text) + ' ', p = normalize(phrase);
  return p && t.includes(' ' + p + ' ') || (p.length > 3 && t.includes(p));
}

// Returns {item, score} of the best KB entry or null.
function bestMatch(text, items, threshold = 0.6) {
  let best = null;
  for (const it of items) {
    let score = similarity(text, it.question);
    if (normalize(text) === normalize(it.question)) score = 1;
    const kws = String(it.keywords || '').split(/[,،]/).map(s => s.trim()).filter(Boolean);
    if (kws.length) {
      const hit = kws.filter(k => containsPhrase(text, k)).length;
      if (hit) score = Math.max(score, Math.min(0.95, 0.55 + 0.2 * hit));
    }
    if (!best || score > best.score) best = { item: it, score };
  }
  return best && best.score >= threshold ? best : null;
}

module.exports = { normalize, tokens, similarity, bestMatch, containsPhrase, toLatinDigits };
