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
      custom: [],      // [{ id, title, keywords, answer, media: [] }]
      media: { history: [], location: [] }
    },
    developer: { show: true, name: '', description: 'تم تطوير هذا المساعد الذكي بواسطة', url: '', logo: '' },
    behavior: {
      auto_learn: true, kb_threshold: 0.6, suggest_threshold: 0.38,
      no_answer_action: 'handoff',      // handoff | suggest_then_handoff | fallback
      numbered_menus: true, inactivity_minutes: 30, retention_days: 90,
      order_keywords: [], handoff_keywords: [],
      // legacy (Arabic) message overrides
      handoff_message: '', no_answer_handoff_message: '', fallback_message: '', agent_joined_message: '', closed_message: '', anything_else: ''
    },
    tickets: { enabled: true, prefix_complaint: 'C', prefix_suggestion: 'S', prefix_inquiry: 'Q', require_email: false, notify_admins: true },
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
      not_found: '', error_message: '', param_prompts: {}
    },
    security: { allowed_domains: '', identity_secret: crypto.randomBytes(24).toString('hex') }
  };
}

function defaultTree() {
  return {
    root: 'root',
    nodes: [
      { id: 'root', title: 'الترحيب', x: 1600, y: 80, auto_next: 'menu',
        message: 'أهلاً {name} 👋\nأنا {bot}، يسعدني خدمتك.',
        i18n: { en: { message: 'Hello {name} 👋\nI am {bot}, happy to help you.' }, ur: { message: 'السلام علیکم {name} 👋\nمیں {bot} ہوں، آپ کی خدمت کے لیے حاضر ہوں۔' } },
        options: [] },
      { id: 'menu', title: 'القائمة الرئيسية', x: 1220, y: 80, numbered: true,
        message: 'اختر رقم الخدمة أو اكتب سؤالك مباشرة:',
        i18n: { en: { message: 'Choose a service number or type your question:' }, ur: { message: 'سروس نمبر منتخب کریں یا اپنا سوال لکھیں:' } },
        options: [
          { label: '📍 موقعنا على الخريطة', action: 'location', i18n: { en: { label: '📍 Our location' }, ur: { label: '📍 ہمارا مقام' } } },
          { label: '🏢 تعرّف علينا', action: 'org', field: 'history', i18n: { en: { label: '🏢 About us' }, ur: { label: '🏢 ہمارا تعارف' } } },
          { label: '📞 أرقام التواصل', action: 'org', field: 'contact', i18n: { en: { label: '📞 Contact numbers' }, ur: { label: '📞 رابطہ نمبر' } } },
          { label: '❓ الأسئلة الشائعة', action: 'goto', target: 'faq', i18n: { en: { label: '❓ FAQ' }, ur: { label: '❓ عام سوالات' } } },
          { label: '📝 الشكاوى والاقتراحات', action: 'goto', target: 'tickets', i18n: { en: { label: '📝 Complaints & suggestions' }, ur: { label: '📝 شکایات و تجاویز' } } },
          { label: '💬 التحدث مع موظف', action: 'handoff', i18n: { en: { label: '💬 Talk to an agent' }, ur: { label: '💬 نمائندے سے بات کریں' } } }
        ] },
      { id: 'faq', title: 'الأسئلة الشائعة', x: 840, y: 40, numbered: true,
        message: 'اختر سؤالك:', i18n: { en: { message: 'Choose your question:' }, ur: { message: 'اپنا سوال منتخب کریں:' } },
        options: [
          { label: 'ساعات العمل', action: 'org', field: 'hours', i18n: { en: { label: 'Working hours' }, ur: { label: 'اوقات کار' } } },
          { label: 'الموقع الإلكتروني وحسابات التواصل', action: 'org', field: 'social', i18n: { en: { label: 'Website & social media' }, ur: { label: 'ویب سائٹ اور سوشل میڈیا' } } },
          { label: 'رؤيتنا ورسالتنا', action: 'org', field: 'vision', i18n: { en: { label: 'Vision & mission' }, ur: { label: 'وژن اور مشن' } } },
          { label: '↩️ القائمة الرئيسية', action: 'goto', target: 'menu', i18n: { en: { label: '↩️ Main menu' }, ur: { label: '↩️ مین مینو' } } }
        ] },
      { id: 'tickets', title: 'الشكاوى والاقتراحات', x: 840, y: 420, numbered: true,
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
  const b = s.behavior || {};
  const bmap = { handoff_message: 'handoff', no_answer_handoff_message: 'no_answer_handoff', fallback_message: 'fallback', agent_joined_message: 'agent_joined', closed_message: 'closed', anything_else: 'anything_else' };
  for (const [from, to] of Object.entries(bmap)) if (b[from] && !t.ar[to]) t.ar[to] = b[from];
  return s;
}

module.exports = { defaultSettings, defaultTree, deepMerge, migrateSettings };
