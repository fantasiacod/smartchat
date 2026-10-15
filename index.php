<?php
/*
 * Smart Chat Agent — صفحة إرشاد تظهر عند رفع البرنامج على استضافة PHP عادية.
 * البرنامج نفسه يعمل بـ Node.js ولا يعمل من هذا المجلد مباشرة.
 */
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

function port_open($port) {
    $c = @fsockopen('127.0.0.1', $port, $e, $s, 0.5);
    if ($c) { fclose($c); return true; }
    return false;
}
$fn = function_exists('shell_exec') && !in_array('shell_exec', array_map('trim', explode(',', (string) ini_get('disable_functions'))));
$node = $fn ? trim((string) @shell_exec('node -v 2>/dev/null')) : '';
$running = port_open(3000);
$exposed = file_exists(__DIR__ . '/server/.env') || is_dir(__DIR__ . '/server/data');
$htaccess_ok = file_exists(__DIR__ . '/.htaccess');
?>
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Smart Chat Agent — التثبيت</title>
<style>
body{margin:0;font-family:system-ui,Tahoma,sans-serif;background:#f4f6f8;color:#0f172a;line-height:1.8}
.w{max-width:760px;margin:40px auto;padding:0 16px}
.c{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:22px 26px;margin-bottom:16px}
h1{margin:0 0 6px;font-size:24px}h2{font-size:17px;margin:0 0 8px;color:#2f9e63}
.s{display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px dashed #e2e8f0}
.ok{color:#15803d}.no{color:#b91c1c}.wa{color:#b45309}
code{background:#f1f5f9;padding:1px 6px;border-radius:4px;direction:ltr;unicode-bidi:isolate}
pre{background:#0f172a;color:#d1fae5;padding:12px;border-radius:8px;direction:ltr;text-align:left;overflow:auto}
ol{padding-inline-start:20px}
.warn{background:#fff7ed;border:1px solid #fed7aa}
</style>
</head>
<body><div class="w">
<div class="c">
  <h1>💬 Smart Chat Agent</h1>
  <p>تم رفع ملفات البرنامج بنجاح، لكن <b>البرنامج يعمل بتقنية Node.js</b> ولا يعمل بفتح هذا المجلد مباشرة مثل مواقع PHP. لهذا ظهر خطأ <b>403 Forbidden</b>.</p>
</div>

<div class="c">
  <h2>فحص الاستضافة</h2>
  <div class="s"><span class="ok">✔</span> PHP يعمل (<?php echo htmlspecialchars(PHP_VERSION); ?>)</div>
  <div class="s"><?php if ($node): ?><span class="ok">✔</span> Node.js متوفر (<?php echo htmlspecialchars($node); ?>)<?php else: ?><span class="wa">!</span> لم يُعثر على Node.js من هنا (قد يكون متاحاً عبر "Setup Node.js App" في لوحة الاستضافة)<?php endif; ?></div>
  <div class="s"><?php if ($running): ?><span class="ok">✔</span> يوجد تطبيق يعمل على المنفذ 3000<?php else: ?><span class="no">✘</span> البرنامج لا يعمل حالياً<?php endif; ?></div>
  <div class="s"><?php if ($htaccess_ok): ?><span class="ok">✔</span> ملفات البرنامج محمية من التحميل المباشر<?php else: ?><span class="no">✘</span> ملف .htaccess مفقود — ملفات البرنامج مكشوفة<?php endif; ?></div>
</div>

<div class="c">
  <h2>الحل 1: استضافتك تدعم Node.js (cPanel ← Setup Node.js App)</h2>
  <ol>
    <li>انقل مجلد <code>server</code> إلى <b>خارج</b> <code>public_html</code>، مثلاً: <code>/home/USER/smart-chat</code></li>
    <li>من cPanel افتح <b>Setup Node.js App ← Create Application</b>:
      <ul>
        <li>Node.js version: <b>18 أو أحدث</b></li>
        <li>Application root: <code>smart-chat</code></li>
        <li>Application URL: نطاق فرعي مثل <code>chat.yourdomain.com</code></li>
        <li>Application startup file: <code>src/server.js</code></li>
      </ul></li>
    <li>في Environment variables أضف: <code>ADMIN_EMAIL</code> و <code>ADMIN_PASSWORD</code></li>
    <li>اضغط <b>Run NPM Install</b> ثم <b>Start / Restart</b>.</li>
    <li>افتح: <code>https://chat.yourdomain.com/admin/</code></li>
  </ol>
  <p>في <b>Hostinger</b> وغيرها من لوحات التحكم: إن كانت خطتك تدعم Node.js ستجد خيار إنشاء "تطبيق Node.js" في لوحة الاستضافة. ارفع مجلد <code>server</code> واختر ملف البدء <code>src/server.js</code>. إن لم تجد الخيار فخطتك لا تدعم Node.js واستخدم الحل 2.</p>
</div>

<div class="c">
  <h2>الحل 2 (الأفضل): سيرفر VPS</h2>
  <p>على أي سيرفر Ubuntu ارفع الملف المضغوط ونفّذ:</p>
  <pre>cd /root && unzip smart-chat.zip && cd smart-chat
sudo bash install.sh</pre>
  <p>يثبّت كل شيء تلقائياً مع شهادة SSL. التفاصيل في <b>دليل-التشغيل.pdf</b>.</p>
</div>

<div class="c warn">
  <h2 style="color:#c2410c">⚠️ مهم بعد التشغيل</h2>
  <p>لا تترك البرنامج داخل <code>public_html</code>. بعد تشغيله بأحد الحلين احذف هذا المجلد من هنا، فهو يحتوي على ملفات الإعدادات وقاعدة البيانات.<?php if ($exposed): ?> <b class="no">(تم اكتشاف ملفات بيانات في هذا المجلد الآن.)</b><?php endif; ?></p>
</div>
</div></body></html>
