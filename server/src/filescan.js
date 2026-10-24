// Checks a visitor's attachment before it enters a conversation.
// - real type from the file's bytes (not its name), only images and PDF
// - images: no hidden scripts / programs / archives inside (polyglot files); JPEG metadata (GPS, camera) removed
// - PDF: no JavaScript, launch actions, embedded files, forms that submit, or encryption (also inside compressed streams)
// - optional VirusTotal look-up by SHA-256 (only the fingerprint is sent, never the file)
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = {
  jpg: { mime: 'image/jpeg', kind: 'image' }, png: { mime: 'image/png', kind: 'image' }, gif: { mime: 'image/gif', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' }, pdf: { mime: 'application/pdf', kind: 'pdf' }
};

function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1'))) return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

// things that must never hide inside a picture
const IMAGE_BAD = [/<\?php/i, /<script/i, /<html/i, /<iframe/i, /<svg[\s>]/i, /%PDF-/, /PK\x03\x04/, /This program cannot be run in DOS mode/, /\x7fELF/, /#!\/(usr\/)?bin\//, /eval\s*\(/i, /base64_decode\s*\(/i];

function stripJpegMeta(b) {
  // keep image data; drop APP1 (EXIF / XMP: GPS, camera), APP13 (IPTC) and comments
  const out = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b; // unexpected layout: leave as is
    const m = b[i + 1];
    if (m === 0xda) { out.push(b.subarray(i)); return Buffer.concat(out); } // start of scan: rest is image data
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return b;
    if (!(m === 0xe1 || m === 0xed || m === 0xfe)) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return b;
}

const PDF_BAD = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData|GoToE|Sound|Movie)\b/;
function pdfProblem(b) {
  const decode = (s) => s.replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))); // /J#61vaScript → /JavaScript
  const raw = decode(b.toString('latin1'));
  if (/\/Encrypt\b/.test(raw)) return 'ملف PDF مشفّر لا يمكن فحصه';
  if (PDF_BAD.test(raw)) return 'ملف PDF يحتوي على أوامر برمجية أو ملفات مضمّنة';
  if (/\/URI\s*\(\s*javascript:/i.test(raw)) return 'ملف PDF يحتوي على روابط برمجية';
  // look inside compressed streams too (bounded)
  let pos = 0, n = 0, total = 0;
  while ((pos = raw.indexOf('stream', pos)) !== -1 && n < 400) {
    let start = pos + 6; if (raw[start] === '\r') start++; if (raw[start] === '\n') start++;
    const end = raw.indexOf('endstream', start); if (end === -1) break;
    n++;
    try {
      const inflated = zlib.inflateSync(b.subarray(start, end), { maxOutputLength: 8 * 1024 * 1024 });
      total += inflated.length; if (total > 40 * 1024 * 1024) return 'ملف PDF كبير جداً بعد فك الضغط';
      const s = decode(inflated.toString('latin1'));
      if (PDF_BAD.test(s)) return 'ملف PDF يحتوي على أوامر برمجية مخفية';
    } catch { /* not a Flate stream (images, fonts…) */ }
    pos = end + 9;
  }
  if (!/%%EOF\s*$/.test(raw.slice(-1024))) return 'ملف PDF غير مكتمل أو تالف';
  return null;
}

async function virusTotal(sha256, key) {
  if (!key) return null;
  try {
    const r = await fetch('https://www.virustotal.com/api/v3/files/' + sha256, { headers: { 'x-apikey': key }, signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return null; // never seen before: nothing known against it
    if (!r.ok) return null;
    const st = (await r.json())?.data?.attributes?.last_analysis_stats || {};
    return (st.malicious || 0) + (st.suspicious || 0) > 0 ? 'الملف مُبلّغ عنه كملف ضار' : null;
  } catch { return null; }
}

/**
 * @returns {Promise<{ok:true, ext, mime, kind, buf, sha256} | {ok:false, reason}>}
 */
async function scan(buf, { maxBytes = 5 * 1024 * 1024, images = true, pdf = true, vtKey = '' } = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) return { ok: false, reason: 'الملف فارغ' };
  if (buf.length > maxBytes) return { ok: false, reason: `حجم الملف أكبر من المسموح (${Math.round(maxBytes / 1048576)} ميجابايت)` };
  const ext = sniff(buf);
  if (!ext) return { ok: false, reason: 'نوع الملف غير مسموح — المسموح: صور أو PDF' };
  const t = TYPES[ext];
  if ((t.kind === 'image' && !images) || (t.kind === 'pdf' && !pdf)) return { ok: false, reason: 'هذا النوع من الملفات غير مسموح' };
  if (t.kind === 'image') {
    const txt = buf.toString('latin1');
    if (IMAGE_BAD.some(re => re.test(txt))) return { ok: false, reason: 'الصورة تحتوي على محتوى مخفي غير آمن' };
    if (ext === 'jpg') buf = stripJpegMeta(buf);
  } else {
    const p = pdfProblem(buf); if (p) return { ok: false, reason: p };
  }
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const vt = await virusTotal(sha256, vtKey); if (vt) return { ok: false, reason: vt };
  return { ok: true, ext, mime: t.mime, kind: t.kind, buf, sha256 };
}

module.exports = { scan, sniff, stripJpegMeta, pdfProblem };
