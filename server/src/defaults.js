const crypto = require('crypto');

function defaultSettings() {
  return {
    appearance: {
      company_name: '',
      company_logo: '',
      footer_text: 'بدعم من',
      show_footer: true,
      primary_color: '#41b072',
      secondary_color: '',
      header_bg: '',
      header_text: '',
      header_style: 'solid',          // solid | gradient
      chat_bg: '#f6f7f9',
      bot_bubble_bg: '#ffffff',
      bot_bubble_text: '#111827',
      visitor_bubble_bg: '',
      visitor_bubble_text: '',
      launcher_bg: '',
      launcher_style: 'solid',        // solid | gradient
      launcher_shape: 'circle',       // circle | rounded | square | pill
      launcher_icon_preset: 'chat',   // chat | dots | square | headset | help | sparkle | wave
      window_radius: 18,
      bubble_radius: 16,
      window_width: 370,
      font_size: 14.5,
      position: 'right',          // right | left
      offset_x: 24,
      offset_y: 24,
      launcher_icon: '',          // image URL or data URL (empty = default chat icon)
      launcher_label: '',         // optional text next to the launcher
      launcher_size: 64,
      title: 'خدمة العملاء',
      subtitle: 'نرد عادة خلال دقائق',
      bot_name: 'المساعد الذكي',
      bot_avatar: '',
      placeholder: 'اكتب رسالتك...',
      teaser: 'مرحباً 👋 هل تحتاج مساعدة؟',
      teaser_delay: 4,
      dir: 'rtl',
      font: '',
      start_label: 'ابدأ المحادثة',
      end_label: 'إنهاء المحادثة',
      rating_max: 5,
      rating_title: 'كيف تقيّم تجربتك معنا؟',
      rating_comment_placeholder: 'ملاحظاتك (اختياري)',
      rating_thanks: 'شكراً لتقييمك 🌟',
      new_chat_label: 'بدء محادثة جديدة',
      hide_on_mobile: false
    },
    prechat: {
      enabled: false,
      title: 'عرّفنا بنفسك قبل البدء',
      name: true,
      phone: true,
      email: false
    },
    behavior: {
      auto_learn: true,
      kb_threshold: 0.6,
      no_answer_action: 'handoff',     // handoff | fallback
      fallback_message: 'عذراً لم أفهم سؤالك، اختر من القائمة أو اطلب التحدث مع موظف.',
      handoff_message: 'لحظات من فضلك، جارٍ تحويلك إلى أحد موظفينا 👨‍💼',
      no_answer_handoff_message: 'لم أجد إجابة لسؤالك، سأحولك الآن إلى أحد موظفينا ليجيبك 👨‍💼',
      agent_joined_message: 'انضم {agent} إلى المحادثة',
      closed_message: 'تم إنهاء المحادثة',
      anything_else: 'هل تحتاج شيئاً آخر؟',
      order_keywords: ['حالة الطلب', 'حالة طلبي', 'طلبي', 'وين طلبي', 'تتبع الطلب', 'رقم الطلب', 'order status'],
      handoff_keywords: ['موظف', 'بشري', 'خدمة العملاء', 'شخص حقيقي', 'agent', 'human'],
      inactivity_minutes: 30,
      retention_days: 90
    },
    datasource: {
      type: 'demo',                    // none | demo | mysql | postgres | api
      connection: '',
      api_url: '',
      api_headers: '{}',
      order_query: 'SELECT status, notes, customer_name FROM demo_orders WHERE order_no = :order_no AND phone = :phone',
      customer_query: 'SELECT name, city, tier FROM demo_customers WHERE phone = :phone OR email = :email',
      order_template: '📦 طلب رقم {order_no}\nالحالة: *{status}*',
      notes_template: '📝 ملاحظات: {notes}',
      customer_template: 'بياناتك المسجلة:\nالاسم: {name}\nالمدينة: {city}\nالفئة: {tier}',
      not_found: 'لم أجد طلباً مطابقاً لهذه البيانات. تأكد من الرقم وحاول مرة أخرى.',
      error_message: 'تعذر الوصول إلى النظام حالياً، يمكنك التحدث مع موظف.',
      param_prompts: {
        order_no: 'من فضلك أرسل رقم الطلب 🔢',
        phone: 'أرسل رقم الجوال المسجل في الطلب 📱',
        email: 'أرسل بريدك الإلكتروني المسجل ✉️',
        id_number: 'أرسل رقم الهوية'
      }
    },
    security: {
      allowed_domains: '',
      identity_secret: crypto.randomBytes(24).toString('hex')
    }
  };
}

function defaultTree() {
  return {
    root: 'root',
    nodes: [
      {
        id: 'root', title: 'الترحيب',
        message: 'أهلاً {name} 👋\nأنا المساعد الذكي، كيف أقدر أخدمك اليوم؟ اختر من القائمة أو اكتب سؤالك.',
        options: [
          { label: '📦 الاستعلام عن حالة طلب', action: 'order_status', target: '' },
          { label: '❓ الأسئلة الشائعة', action: 'goto', target: 'faq' },
          { label: '👤 بياناتي', action: 'customer_info', target: '' },
          { label: '💬 التحدث مع موظف', action: 'handoff', target: '' }
        ]
      },
      {
        id: 'faq', title: 'الأسئلة الشائعة',
        message: 'اختر سؤالك:',
        options: [
          { label: 'ساعات العمل', action: 'goto', target: 'hours' },
          { label: 'طرق الدفع', action: 'goto', target: 'payment' },
          { label: 'سياسة الاسترجاع', action: 'goto', target: 'refund' },
          { label: '↩️ رجوع', action: 'goto', target: 'root' }
        ]
      },
      { id: 'hours', title: 'ساعات العمل', message: 'نعمل من الأحد إلى الخميس، من 9 صباحاً حتى 5 مساءً.',
        options: [{ label: '↩️ رجوع', action: 'goto', target: 'faq' }, { label: '🏠 القائمة الرئيسية', action: 'goto', target: 'root' }] },
      { id: 'payment', title: 'طرق الدفع', message: 'نقبل مدى، فيزا، ماستركارد، Apple Pay، والدفع عند الاستلام.',
        options: [{ label: '↩️ رجوع', action: 'goto', target: 'faq' }, { label: '🏠 القائمة الرئيسية', action: 'goto', target: 'root' }] },
      { id: 'refund', title: 'الاسترجاع', message: 'يمكنك استرجاع المنتج خلال 14 يوماً من الاستلام بشرط أن يكون بحالته الأصلية.',
        options: [{ label: '💬 أحتاج مساعدة إضافية', action: 'handoff', target: '' }, { label: '🏠 القائمة الرئيسية', action: 'goto', target: 'root' }] }
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

module.exports = { defaultSettings, defaultTree, deepMerge };
