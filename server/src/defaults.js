const crypto = require('crypto');

function defaultSettings() {
  return {
    languages: { enabled: ['ar'], default: 'ar', show_switcher: true },
    appearance: {
      // identity
      company_name: '', company_logo: '', show_unified_number: true, footer_text: 'بدعم من', show_footer: true,
      // core palette (simple mode)
      primary_color: '#1a6739', secondary_color: '#bc9525', header_bg: '', header_text: '', header_style: 'gradient',
      // advanced palette
      chat_bg: '#f6f7f4', panel_bg: '#ffffff', panel_text: '#111827',
      bot_bubble_bg: '#ffffff', bot_bubble_text: '#111827', agent_bubble_bg: '', agent_bubble_text: '',
      visitor_bubble_bg: '', visitor_bubble_text: '', system_bg: '#eceee9', system_text: '#374151',
      option_bg: '#ffffff', option_text: '', input_bg: '#ffffff', input_text: '#111827',
      footer_bg: '#ffffff', footer_color: '#9ca3af', avatar_bg: '',
      launcher_bg: '', launcher_text: '', launcher_style: 'solid', teaser_bg: '#ffffff', teaser_text: '#111827',
      // typography
      font: 'Tajawal', font_size: 14.5,
      // shapes
      launcher_shape: 'circle', launcher_icon_preset: 'chat', launcher_icon: '', launcher_label: '', launcher_size: 64,
      window_width: 370, window_radius: 18, bubble_radius: 16, option_style: 'pill', // pill | card | list
      position: 'right', offset_x: 24, offset_y: 24, hide_on_mobile: false, dir: 'auto',
      bot_avatar: '', teaser_delay: 4,
      // decoration
      pattern: 'girih12', pattern_color: '', pattern_opacity: 0.07, pattern_scale: 1, pattern_header: true, pattern_chat: true,
      pattern_logo: '', pattern_images: [], pattern_img_tint: false, // image patterns: small copies of the logo / admin's pictures
      occasions: { auto: false, ramadan: true, eid: true, national: true, founding: true }, // switch the decoration automatically on occasions
      // legacy text fields (Arabic defaults, kept for compatibility — the per-language texts take priority)
      title: '', subtitle: '', bot_name: '', placeholder: '', teaser: '', start_label: '', end_label: '', new_chat_label: '',
      rating_max: 5, rating_title: '', rating_comment_placeholder: '', rating_thanks: ''
    },
    texts: { ar: {}, en: {}, ur: {} },
    prechat: { enabled: false, title: '', name: true, phone: true, email: false },
    org: {
      name: '', short: '', history: '', vision: '', mission: '', goals: '',
      unified_number: '', email: '', website: '', address: '', map_url: '', lat: '', lng: '', hours: '',
      departments: [], // [{ name, phones }]
      social: { x: '', instagram: '', snapchat: '', tiktok: '', youtube: '', facebook: '', linkedin: '', whatsapp: '' },
      custom: [],      // legacy cards (migrated into sections)
      media: { history: [], location: [] },
      // "About us" sections shown as a menu and answered by keyword: [{ id, key, title, icon, color, text, keywords, media, i18n }]
      sections: [],
      // Bank accounts grouped under main categories: [{ id, name, icon, color, accounts: [{ id, bank, holder, iban, number, note }] }]
      banks: [],
      // branches / extra locations: [{ id, name, city, address, map_url, phones, hours, media: [] }]
      branches: [],
      sections_v: 0
    },
    developer: { show: true, name: '', description: 'تم تطوير هذا المساعد الذكي بواسطة', url: '', logo: '' },
    behavior: {
      auto_learn: true, kb_threshold: 0.6, suggest_threshold: 0.38,
      no_answer_action: 'handoff',      // always: no answer -> immediate hand-off to a human
      numbered_menus: true, inactivity_minutes: 30, retention_days: 90,
      // working hours: outside them the visitor leaves name + phone and is called back on a working day
      work_hours: {
        enabled: false, allow_handoff: false, timezone: 'Asia/Riyadh', message: '',
        days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ day: d, open: d <= 4, from: '08:00', to: '16:00' })) // 0 = Sunday
      },
      order_keywords: [], handoff_keywords: [],
      // legacy (Arabic) message overrides
      handoff_message: '', no_answer_handoff_message: '', fallback_message: '', agent_joined_message: '', closed_message: '', anything_else: ''
    },
    integrations: { webhooks: [] }, // [{ id, url, secret, events: [], enabled }]
    tickets: { enabled: true, prefix_complaint: 'C', prefix_suggestion: 'S', prefix_inquiry: 'Q', prefix_callback: 'R', require_email: false, notify_admins: true },
    notify: {
      admin_emails: '',
      email: { enabled: false, host: '', port: 587, secure: false, user: '', pass: '', from_name: '', from_email: '' },
      sms: { enabled: false, provider: 'none', api_key: '', sender: '', username: '', account_sid: '', auth_token: '', custom_url: '', custom_method: 'POST', custom_headers: '{"Content-Type":"application/json"}', custom_body: '{"to":"{phone}","message":"{message}"}' },
      whatsapp: { mode: 'manual', phone_number_id: '', token: '', api_version: 'v21.0' },
      channels: { ticket_created: { email: true, sms: true, whatsapp: true }, ticket_updated: { email: true, sms: true, whatsapp: true } },
      templates: {
        ticket_created_subject: 'تم استلام {type} رقم {number}',
        ticket_created: 'مرحباً {name}،\nتم استلام {type} رقم {number} بتاريخ {date}.\nسنقوم بمراجعتها وإبلاغك بأي تحديث.\n{org}',
        ticket_updated_subject: 'تحديث على {type} رقم {number}',
        ticket_updated: 'مرحباً {name}،\nتم تحديث حالة {type} رقم {number} إلى: {status}.\n{reply}\n{org}',
        admin_new_ticket_subject: '{type} جديدة رقم {number}',
        admin_new_ticket: 'وصلت {type} جديدة رقم {number}\nالاسم: {name}\nالجوال: {phone}\n\n{text}'
      }
    },
    datasource: {
      type: 'demo', connection: '', api_url: '', api_headers: '{}',
      order_query: 'SELECT status, notes, customer_name FROM demo_orders WHERE order_no = :order_no AND phone = :phone',
      customer_query: 'SELECT name, city, tier FROM demo_customers WHERE phone = :phone OR email = :email',
      order_template: '📦 طلب رقم {order_no}\nالحالة: *{status}*', notes_template: '📝 ملاحظات: {notes}',
      customer_template: 'بياناتك المسجلة:\nالاسم: {name}\nالمدينة: {city}\nالفئة: {tier}',
      not_found: '', error_message: '', param_prompts: {},
      // the boxes the bot asks for: [{ key, label, type: text|number|phone|id|email|date|code, prompt, prompt_en, prompt_ur, error }]
      fields: [],
      // additional databases / APIs and custom look-ups (e.g. beneficiary file, aid schedule, appointments)
      connections: [],  // [{ id, name, type: mysql|postgres|api, connection, api_url, api_headers }]
      lookups: []       // [{ id, title, keywords, connection: 'main'|<id>, query, template, not_found }]
    },
    // eligibility calculator programs: [{ id, title, keywords, intro, enabled, questions, calcs, rules, amount, messages, after }]
    // dashboard pages the admin chose to hide from the system (the settings page itself can never be hidden)
    ui: { hidden_pages: [] },
    // appointments calendar (salons, clinics…): the bot tells a visitor his appointment by name
    appointments: { verify_phone: false, services: ['قص شعر', 'صبغة', 'سشوار', 'مكياج', 'عناية بالبشرة'], staff: [], show_staff: true, not_found: '' },
    eligibility: { hub: { label: '🧮 حساب آلية الاستحقاق', message: '', keywords: '', skip_single: false }, programs: [] },
    security: { allowed_domains: '', identity_secret: crypto.randomBytes(24).toString('hex') }
  };
}

function defaultTree() {
  return {
    root: 'root',
    nodes: [
      { id: 'root', title: 'الترحيب', x: 1500, y: 80, auto_next: 'menu',
        message: 'أهلاً {name} 👋\nأنا {bot}، يسعدني خدمتك.',
        i18n: { en: { message: 'Hello {name} 👋\nI am {bot}, happy to help you.' }, ur: { message: 'السلام علیکم {name} 👋\nمیں {bot} ہوں، آپ کی خدمت کے لیے حاضر ہوں۔' } },
        options: [] },
      { id: 'menu', title: 'القائمة الرئيسية', x: 1120, y: 80, numbered: true,
        message: 'اختر رقم الخدمة أو اكتب سؤالك مباشرة:',
        i18n: { en: { message: 'Choose a service number or type your question:' }, ur: { message: 'سروس نمبر منتخب کریں یا اپنا سوال لکھیں:' } },
        options: [
          { label: '🏢 تعرّف علينا', action: 'about', i18n: { en: { label: '🏢 About us' }, ur: { label: '🏢 ہمارا تعارف' } } },
          { label: '📍 موقعنا على الخريطة', action: 'location', i18n: { en: { label: '📍 Our location' }, ur: { label: '📍 ہمارا مقام' } } },
          { label: '📞 أرقام التواصل', action: 'org', field: 'contact', i18n: { en: { label: '📞 Contact numbers' }, ur: { label: '📞 رابطہ نمبر' } } },
          { label: '🏦 الحسابات البنكية', action: 'banks', i18n: { en: { label: '🏦 Bank accounts' }, ur: { label: '🏦 بینک اکاؤنٹس' } } },
          { label: '❓ الأسئلة الشائعة', action: 'kb_browse', i18n: { en: { label: '❓ FAQ' }, ur: { label: '❓ عام سوالات' } } },
          { label: '📝 الشكاوى والاقتراحات', action: 'goto', target: 'tickets', i18n: { en: { label: '📝 Complaints & suggestions' }, ur: { label: '📝 شکایات و تجاویز' } } },
          // appear automatically once queries / eligibility programs are added in the dashboard
          { label: '🔎 استعلاماتي (طلباتي وبياناتي)', action: 'lookups_menu', i18n: { en: { label: '🔎 My requests & details' }, ur: { label: '🔎 میری درخواستیں اور معلومات' } } },
          { label: '🧮 حساب آلية الاستحقاق', action: 'eligibility_menu', i18n: { en: { label: '🧮 Eligibility check' }, ur: { label: '🧮 اہلیت کا حساب' } } }
        ] },
      { id: 'tickets', title: 'الشكاوى والاقتراحات', x: 740, y: 260, numbered: true,
        message: 'نسعد بسماع ملاحظاتك. ماذا تريد أن تفعل؟',
        i18n: { en: { message: 'We value your feedback. What would you like to do?' }, ur: { message: 'ہم آپ کی رائے کی قدر کرتے ہیں۔ آپ کیا کرنا چاہتے ہیں؟' } },
        options: [
          { label: '📝 تقديم شكوى', action: 'ticket', field: 'complaint', i18n: { en: { label: '📝 Submit a complaint' }, ur: { label: '📝 شکایت درج کریں' } } },
          { label: '💡 تقديم اقتراح', action: 'ticket', field: 'suggestion', i18n: { en: { label: '💡 Submit a suggestion' }, ur: { label: '💡 تجویز دیں' } } },
          { label: '🔎 متابعة طلب سابق', action: 'ticket_status', i18n: { en: { label: '🔎 Track a previous request' }, ur: { label: '🔎 پچھلی درخواست دیکھیں' } } },
          { label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu', i18n: { en: { label: '↩️ Main menu' }, ur: { label: '↩️ مین مینو' } } }
        ] }
    ]
  };
}

/* ---------- ready trees by organisation type (everything stays editable; unused features hide themselves) ---------- */
const B = (label, action, extra = {}, en) => ({ label, action, ...extra, ...(en ? { i18n: { en: { label: en } } } : {}) });
const HOME_BTN = B('↩️ القائمة الرئيسية', 'goto', { target: 'menu' }, '↩️ Main menu');
const EDIT = '\n\n✏️ (عدّل هذا النص من «القوائم والأزرار»)';
function baseTree(welcome, menuMsg, options, extraNodes = []) {
  return { root: 'root', nodes: [
    { id: 'root', title: 'الترحيب', x: 1500, y: 80, auto_next: 'menu', message: welcome, i18n: { en: { message: 'Hello {name} 👋\nI am {bot}, happy to help you.' } }, options: [] },
    { id: 'menu', title: 'القائمة الرئيسية', x: 1120, y: 80, numbered: true, message: menuMsg, i18n: { en: { message: 'Choose a service number or type your question:' } }, options },
    ...extraNodes.map((n, i) => ({ x: 740, y: 80 + i * 260, numbered: true, ...n }))
  ] };
}
const feedbackNode = (title = 'رأيك يهمنا') => ({ id: 'tickets', title, message: 'نسعد بسماع ملاحظاتك. ماذا تريد أن تفعل؟', i18n: { en: { message: 'We value your feedback. What would you like to do?' } }, options: [
  B('📝 تقديم شكوى', 'ticket', { field: 'complaint' }, '📝 Complaint'), B('💡 تقديم اقتراح', 'ticket', { field: 'suggestion' }, '💡 Suggestion'), B('🔎 متابعة طلب سابق', 'ticket_status', {}, '🔎 Track a request'), HOME_BTN] });
const contactNode = () => ({ id: 'contact', title: 'تواصل معنا', message: 'كيف تحب أن تتواصل معنا؟', i18n: { en: { message: 'How would you like to reach us?' } }, options: [
  B('📞 أرقام التواصل', 'org', { field: 'contact' }, '📞 Phone numbers'), B('📱 حسابات التواصل الاجتماعي', 'org', { field: 'social' }, '📱 Social media'), B('🌐 الموقع الإلكتروني', 'org', { field: 'website' }, '🌐 Website'), B('👨‍💼 التحدث مع موظف', 'handoff', {}, '👨‍💼 Talk to an agent'), HOME_BTN] });
const WELCOME = 'أهلاً {name} 👋\nأنا {bot}، يسعدني خدمتك.';
const MENU_MSG = 'اختر رقم الخدمة أو اكتب سؤالك مباشرة:';

const TREE_TYPES = {
  charity: { icon: '🤝', name: 'جمعية خيرية', desc: 'تعريف، تبرع، تسجيل مستفيدين، حساب الاستحقاق، الاستعلام عن الطلبات، تطوع', build: () => defaultTree() },
  foundation: { icon: '💚', name: 'مؤسسة مانحة / داعمة', desc: 'طلبات دعم، شروط وأهلية، متابعة الطلب، مجالات الدعم', build: () => baseTree(WELCOME, MENU_MSG, [
    B('🏢 تعرّف علينا', 'about', {}, '🏢 About us'),
    B('🎯 مجالات الدعم', 'goto', { target: 'fields' }, '🎯 What we support'),
    B('📝 تقديم طلب دعم', 'goto', { target: 'apply' }, '📝 Apply for support'),
    B('🧮 حساب آلية الاستحقاق', 'eligibility_menu', {}, '🧮 Eligibility check'),
    B('🔎 متابعة طلبي', 'lookups_menu', {}, '🔎 Track my request'),
    B('❓ الأسئلة الشائعة', 'kb_browse', {}, '❓ FAQ'),
    B('📍 موقعنا', 'location', {}, '📍 Location'),
    B('📞 تواصل معنا', 'goto', { target: 'contact' }, '📞 Contact us'),
    B('📝 الشكاوى والاقتراحات', 'goto', { target: 'tickets' }, '📝 Feedback')
  ], [
    { id: 'fields', title: 'مجالات الدعم', message: 'نقدّم الدعم في المجالات التالية:\n• التعليم\n• الصحة\n• الإسكان\n• المشاريع التنموية' + EDIT, options: [B('📝 تقديم طلب دعم', 'goto', { target: 'apply' }), HOME_BTN] },
    { id: 'apply', title: 'تقديم طلب دعم', message: 'خطوات تقديم طلب الدعم:\n1. تأكد من انطباق الشروط (يمكنك حساب أهليتك من هنا)\n2. جهّز المستندات المطلوبة\n3. قدّم الطلب عبر منصتنا' + EDIT, options: [B('🧮 هل أنا مؤهل؟', 'eligibility_menu'), B('📞 اطلب اتصالاً منا', 'ticket', { field: 'callback' }), HOME_BTN] },
    contactNode(), feedbackNode()
  ]) },
  company: { icon: '🏢', name: 'شركة', desc: 'منتجات وخدمات، طلب عرض سعر، تتبع الطلب، الدعم الفني، الوظائف', build: () => baseTree(WELCOME, MENU_MSG, [
    B('🏢 من نحن', 'about', {}, '🏢 About us'),
    B('🛍️ منتجاتنا وخدماتنا', 'goto', { target: 'products' }, '🛍️ Products & services'),
    B('💰 طلب عرض سعر', 'ticket', { field: 'callback' }, '💰 Request a quote'),
    B('📦 تتبع طلبي', 'lookups_menu', {}, '📦 Track my order'),
    B('🛠️ الدعم الفني', 'goto', { target: 'support' }, '🛠️ Technical support'),
    B('💼 الوظائف', 'answer', { target: 'نرحب بانضمامك لفريقنا 💼\nأرسل سيرتك الذاتية إلى: jobs@example.com' + EDIT }, '💼 Careers'),
    B('📍 فروعنا', 'location', {}, '📍 Branches'),
    B('📞 تواصل معنا', 'goto', { target: 'contact' }, '📞 Contact us')
  ], [
    { id: 'products', title: 'منتجاتنا وخدماتنا', message: 'نقدّم لكم:\n• المنتج / الخدمة الأولى\n• المنتج / الخدمة الثانية' + EDIT, options: [B('💰 طلب عرض سعر', 'ticket', { field: 'callback' }), B('❓ أسئلة شائعة', 'kb_browse'), HOME_BTN] },
    { id: 'support', title: 'الدعم الفني', message: 'كيف نقدر نساعدك؟', options: [B('❓ حلول المشاكل الشائعة', 'kb_browse'), B('📝 فتح بلاغ', 'ticket', { field: 'complaint' }), B('🔎 متابعة بلاغ', 'ticket_status'), B('👨‍💼 التحدث مع موظف الدعم', 'handoff'), HOME_BTN] },
    contactNode(), feedbackNode()
  ]) },
  institution: { icon: '🏛️', name: 'مؤسسة / جهة خدمية', desc: 'خدمات، الاستعلام عن معاملة، حجز موعد، أوقات العمل، الفروع', build: () => baseTree(WELCOME, MENU_MSG, [
    B('🏛️ عن المؤسسة', 'about', {}, '🏛️ About us'),
    B('🧾 خدماتنا', 'goto', { target: 'services' }, '🧾 Our services'),
    B('📋 الاستعلام عن معاملة', 'lookups_menu', {}, '📋 Check a transaction'),
    B('📅 طلب موعد', 'ticket', { field: 'callback' }, '📅 Book an appointment'),
    B('🕘 أوقات العمل', 'org', { field: 'hours' }, '🕘 Working hours'),
    B('📍 الفروع والمواقع', 'location', {}, '📍 Branches'),
    B('📞 تواصل معنا', 'goto', { target: 'contact' }, '📞 Contact us'),
    B('📝 الشكاوى والاقتراحات', 'goto', { target: 'tickets' }, '📝 Feedback')
  ], [
    { id: 'services', title: 'خدماتنا', message: 'اختر الخدمة لمعرفة متطلباتها:', options: [B('❓ دليل الخدمات والأسئلة', 'kb_browse'), B('📋 الاستعلام عن معاملة', 'lookups_menu'), B('📅 طلب موعد', 'ticket', { field: 'callback' }), HOME_BTN] },
    contactNode(), feedbackNode()
  ]) },
  cafe: { icon: '☕', name: 'مقهى / مطعم', desc: 'المنيو والأسعار، العروض، أوقات العمل، الفروع، الطلب والتوصيل، حجز طاولة', build: () => baseTree('أهلاً {name} ☕\nمرحباً بك! أنا {bot}، كيف أخدمك؟', 'اختر رقم الخدمة:', [
    B('☕ المنيو والأسعار', 'goto', { target: 'menu_items' }, '☕ Menu & prices'),
    B('🎉 العروض', 'answer', { target: 'عروض هذا الأسبوع 🎉\n• اكتب عرضك هنا' + EDIT }, '🎉 Offers'),
    B('🛵 الطلب والتوصيل', 'answer', { target: 'اطلب الآن عبر تطبيقات التوصيل 🛵\n(اكتب أسماء التطبيقات أو رابط الطلب)' + EDIT }, '🛵 Order & delivery'),
    B('📅 حجز طاولة', 'ticket', { field: 'callback' }, '📅 Book a table'),
    B('🕘 أوقات العمل', 'org', { field: 'hours' }, '🕘 Opening hours'),
    B('📍 فروعنا', 'location', {}, '📍 Our branches'),
    B('📱 تابعنا', 'org', { field: 'social' }, '📱 Follow us'),
    B('💬 رأيك يهمنا', 'goto', { target: 'tickets' }, '💬 Feedback')
  ], [
    { id: 'menu_items', title: 'المنيو', message: 'هذا المنيو 👇 (ارفع صورة أو PDF للمنيو من «القوائم والأزرار» ← مرفقات)', media: [], options: [B('🎉 العروض', 'answer', { target: 'عروض هذا الأسبوع 🎉' + EDIT }), B('🛵 الطلب والتوصيل', 'answer', { target: 'اطلب الآن عبر تطبيقات التوصيل 🛵' + EDIT }), HOME_BTN] },
    feedbackNode()
  ]) },
  salon: { icon: '💇', name: 'صالون / مركز تجميل', desc: 'الخدمات والأسعار، حجز موعد، الاستعلام عن موعدي بالاسم، العروض، أوقات العمل', build: () => baseTree('أهلاً {name} 💇‍♀️\nمرحباً بك! أنا {bot}، كيف أخدمك؟', 'اختر رقم الخدمة:', [
    B('💇 خدماتنا والأسعار', 'goto', { target: 'services' }, '💇 Services & prices'),
    B('📅 حجز موعد', 'ticket', { field: 'callback' }, '📅 Book an appointment'),
    B('🕒 متى موعدي؟', 'appointment_lookup', {}, '🕒 When is my appointment?'),
    B('🎉 العروض', 'answer', { target: 'عروض هذا الشهر 🎉\n• اكتب عرضك هنا' + EDIT }, '🎉 Offers'),
    B('🕘 أوقات العمل', 'org', { field: 'hours' }, '🕘 Opening hours'),
    B('📍 موقعنا', 'location', {}, '📍 Location'),
    B('📱 تابعينا', 'org', { field: 'social' }, '📱 Follow us'),
    B('💬 رأيك يهمنا', 'goto', { target: 'tickets' }, '💬 Feedback')
  ], [
    { id: 'services', title: 'خدماتنا والأسعار', message: 'خدماتنا 👇\n• قص شعر — 100 ريال\n• صبغة — من 250 ريال\n• سشوار — 80 ريال' + EDIT + '\n(ويمكنك رفع صورة قائمة الأسعار كمرفق)', media: [], options: [B('📅 حجز موعد', 'ticket', { field: 'callback' }), B('🕒 متى موعدي؟', 'appointment_lookup'), HOME_BTN] },
    feedbackNode()
  ]) },
  blank: { icon: '✨', name: 'قائمة خاصة (فارغة)', desc: 'ترحيب وقائمة رئيسية بسيطة، وتبني الباقي بنفسك', build: () => baseTree(WELCOME, MENU_MSG, [
    B('❓ الأسئلة الشائعة', 'kb_browse', {}, '❓ FAQ'), B('📞 أرقام التواصل', 'org', { field: 'contact' }, '📞 Contact'), B('👨‍💼 التحدث مع موظف', 'handoff', {}, '👨‍💼 Talk to an agent')
  ]) }
};
function treeTemplate(type) { return (TREE_TYPES[type] || TREE_TYPES.charity).build(); }

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = (k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]))
      ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

// Upgrades settings written by older versions (including fields added by other editors) into the current shape.
function migrateSettings(s) {
  const a = s.appearance || {}, o = s.org || (s.org = {});
  const pick = (k) => (a[k] != null && a[k] !== '' ? a[k] : '');
  if (!o.name && a.company_name) o.name = a.company_name;
  if (!o.history && pick('company_description')) o.history = a.company_description;
  if (!o.unified_number && pick('unified_number')) o.unified_number = a.unified_number;
  if (!o.email && pick('company_email')) o.email = a.company_email;
  if (!o.website && pick('company_website')) o.website = a.company_website;
  if (!o.address && pick('company_location')) o.address = a.company_location;
  if (!o.map_url && pick('company_map_url')) o.map_url = a.company_map_url;
  if (pick('company_phone') && !(o.departments || []).length) o.departments = [{ name: '', phones: a.company_phone }];
  if (a.decoration_style && a.decoration_style !== 'none' && !a.pattern) a.pattern = { geometric: 'khatam', arabesque: 'arabesque', arabic_letters: 'arabesque' }[a.decoration_style] || 'khatam';
  if (a.footer_text && /^#/.test(a.footer_text)) { a.footer_color = a.footer_text; a.footer_text = 'بدعم من'; }
  // legacy Arabic texts -> texts.ar
  const t = (s.texts = s.texts || {}); t.ar = t.ar || {};
  const map = { title: 'title', subtitle: 'subtitle', bot_name: 'bot_name', placeholder: 'placeholder', teaser: 'teaser', start_label: 'start', end_label: 'end_chat', new_chat_label: 'new_chat', rating_title: 'rating_title', rating_comment_placeholder: 'rating_comment', rating_thanks: 'rating_thanks' };
  for (const [from, to] of Object.entries(map)) if (a[from] && !t.ar[to]) t.ar[to] = a[from];
  if (!o.sections_v) { // v3: history/vision/mission/goals + custom cards -> icon sections
    const sec = (o.sections = Array.isArray(o.sections) ? o.sections : []);
    const add = (key, title, icon, text, media) => { if (text || (media || []).length) sec.push({ id: key, key, title, icon, color: '', text: text || '', keywords: '', media: media || [], i18n: {} }); };
    add('history', 'نبذة عن الجمعية', 'building', [o.short, o.history].filter(Boolean).join('\n\n'), o.media?.history);
    add('vision', 'رؤيتنا', 'eye', o.vision); add('mission', 'رسالتنا', 'flag', o.mission); add('goals', 'أهدافنا', 'target', o.goals);
    for (const c of o.custom || []) sec.push({ id: c.id || ('c' + Math.random().toString(36).slice(2, 7)), key: '', title: c.title || '', icon: 'info', color: '', text: c.answer || '', keywords: c.keywords || '', media: c.media || [], i18n: c.i18n || {} });
    o.sections_v = 1;
  }
  if (!Array.isArray(o.banks)) o.banks = [];
  if (!Array.isArray(o.branches)) o.branches = [];
  const b = s.behavior || {};
  const bmap = { handoff_message: 'handoff', no_answer_handoff_message: 'no_answer_handoff', fallback_message: 'fallback', agent_joined_message: 'agent_joined', closed_message: 'closed', anything_else: 'anything_else' };
  for (const [from, to] of Object.entries(bmap)) if (b[from] && !t.ar[to]) t.ar[to] = b[from];
  return s;
}

module.exports = { defaultSettings, defaultTree, treeTemplate, TREE_TYPES, deepMerge, migrateSettings };
