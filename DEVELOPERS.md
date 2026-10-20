# دليل المطوّرين — تطوير وتوسعة المساعد الذكي

البرنامج مبني بطريقة تسهّل تطويره: كل وحدة في ملف مستقل، وتوجد واجهة REST كاملة وإشعارات Webhook وبروتوكول WebSocket موثّق.

## هيكل المشروع

```
server/
  src/start.js        نقطة التشغيل (استرجاع التخزين ثم تشغيل الخادم)
  src/server.js       REST API + الصلاحيات + الترويسات الأمنية
  src/chat.js         محرك المحادثة: الشجرة، الخريطة الذهنية، معلومات الجهة، البنوك، التحويل، التعلّم
  src/datasource.js   الربط مع MySQL، PostgreSQL، SQL Server، Oracle، MongoDB، SQLite، Google Sheets، Excel/CSV، REST API (قراءة فقط)
  src/tickets.js      الشكاوى والاقتراحات
  src/notify.js       البريد SMTP و SMS وواتساب
  src/webhooks.js     الإشعارات الصادرة للأنظمة الأخرى
  src/eligibility.js  حاسبة الاستحقاق (معادلات آمنة بدون تنفيذ كود)
  src/backup.js       النسخ الاحتياطي والاسترجاع والتصفير
  src/reports.js      الإحصائيات وتقارير Excel
  src/i18n.js         نصوص اللغات وكلمات فهم النوايا (عربي / English / اردو)
  src/defaults.js     الإعدادات الافتراضية + ترقية الإصدارات
  src/db.js           قاعدة بيانات النظام (SQLite) + الترقيات
  src/persist.js      التخزين في Supabase / MySQL للاستضافات المجانية
  public/widget.js    ودجت المحادثة (Shadow DOM، ملف واحد)
  public/icons.js     مكتبة الأيقونات والبنوك (مشتركة بين الخادم والواجهة)
  public/patterns.js  الزخارف
  public/admin/       لوحة التحكم (core.js + صفحات pages-*.js)
  test/flow.test.js   117 فحصاً لكل التدفقات
  test/load.js        اختبار التحمّل
```

## إضافة إجراء جديد لزر

1. في `src/chat.js`: أضف حالة `case 'my_action':` داخل الدالة `runAction`.
2. في `public/admin/pages-tree.js`: أضف الإجراء إلى القائمة `ACTIONS`، ومعه حقوله في `drawParams` إن احتاج.
3. أضف فحصاً في `test/flow.test.js`.

## إضافة نوع قاعدة بيانات جديد

في `src/datasource.js`: أضف النوع إلى `TYPES`، وأنشئ الاتصال في `getPool`، ونفّذ الاستعلام في `query` (أعد مصفوفة صفوف). ثم أضفه إلى `TYPES` في صفحة `datasource` داخل `public/admin/pages-v3.js` مع مثال الرابط والاستعلام.

## إضافة لغة

أضف اللغة إلى `LANGS` في `src/i18n.js`، ثم انسخ قاموس `T.en` وترجمه، وأضف كلماتها إلى `INTENTS`.

## Webhooks

من **الإعدادات ← الربط مع الأنظمة**. يرسل البرنامج طلب `POST` بصيغة JSON:

```json
{ "event": "ticket.created", "site": { "id": 1, "name": "..." }, "at": "2026-10-19T12:00:00Z", "data": { ... } }
```

الترويسات: `X-SmartChat-Event` و `X-SmartChat-Signature: sha256=<HMAC(body, secret)>`.

الأحداث المتاحة: `conversation.started`، `conversation.handoff`، `conversation.closed` (مع نص المحادثة)، `conversation.rated`، `ticket.created`، `ticket.updated`، `kb.learned`، `eligibility.checked` (نتيجة حاسبة الاستحقاق).

## REST API (أهم المسارات)

سجّل الدخول عبر `POST /api/auth/login`، ثم أرسل الترويسة `Authorization: Bearer <token>` مع كل طلب.

| المسار | الوصف |
|---|---|
| `GET /api/conversations?site=&status=&q=` | المحادثات |
| `GET /api/conversations/:id` | تفاصيل محادثة ورسائلها |
| `GET/POST/PUT/DELETE /api/kb` | الأسئلة والأجوبة (مع `category_id`) |
| `GET /api/mindmap?site=` | الخريطة الذهنية كاملة |
| `POST/PUT/DELETE /api/kb-categories` | تصنيفات الخريطة الذهنية |
| `GET/POST/PUT /api/tickets` | الشكاوى والاقتراحات |
| `GET /api/tickets/export` و `GET /api/reports/agents.xlsx` | تصدير Excel |
| `GET /api/stats?site=&days=` | الإحصائيات |
| `PUT /api/sites/:id` | الإعدادات (`settings.org`، `appearance`، `datasource`، …) |
| `GET /api/backup/download` و `POST /api/backup/restore` | النسخ الاحتياطي والاسترجاع |
| `GET /api/widget/config?site=KEY` | إعدادات الودجت (عام، بدون تسجيل دخول) |

## بروتوكول الودجت (Socket.io — المسار ‎/visitor)

**الرسائل التي يرسلها الودجت:** `join {site, visitorId, lang}`، `start {name, phone}`، `message {text}`، `option {mid, i}`، `form_submit {mid, values}`، `lang {lang}`، `close`، `rate {rating, comment}`.

**الرسائل التي يستقبلها:** `history`، `message` (وقد تحتوي على options أو media أو location أو contacts أو banks أو card أو form)، `status`، `typing`، `closed`، `form_done`.

## التشغيل والاختبار

```bash
cd server && npm install
npm test                                              # 117 فحصاً
node test/load.js http://localhost:3000 SITE_KEY 600  # اختبار التحمّل
```
