// Default texts for the bot and the widget, per language. Each site can override any key per language.
const LANGS = {
  ar: { name: 'العربية', dir: 'rtl' },
  en: { name: 'English', dir: 'ltr' },
  ur: { name: 'اردو', dir: 'rtl' }
};

const T = {
  ar: {
    branches_title: '📍 لدينا أكثر من فرع — اختر الفرع:', main_branch: 'المقر الرئيسي', branch_hours: '🕘 أوقات العمل:',
    related_title: 'أسئلة ذات صلة:',
    after_hours: 'نعتذر، نحن الآن خارج أوقات العمل 🌙\nأوقات العمل:\n{hours}\n\nاترك اسمك ورقم جوالك وسنتواصل معك في أقرب يوم عمل بإذن الله.', t_callback: 'طلب تواصل', ticket_form_callback: 'اترك بياناتك وسنتواصل معك', callback_created: '✅ تم تسجيل طلبك برقم *{number}*.\nسنتواصل معك خلال أوقات العمل الرسمية بإذن الله.', closed_day: 'مغلق', days: 'الأحد,الإثنين,الثلاثاء,الأربعاء,الخميس,الجمعة,السبت', off_hours_status: 'خارج أوقات العمل',
    about_title: 'ماذا تحب أن تعرف عنا؟ اختر من القائمة:', hours_label: '🕘 ساعات العمل', web_social_label: '🌐 موقعنا وحساباتنا', banks_title: '🏦 حساباتنا البنكية — اختر التصنيف:', banks_group: '🏦 {group}', banks_empty: 'لم تتم إضافة حسابات بنكية بعد.', iban: 'الآيبان', account_no: 'رقم الحساب', copy: 'نسخ', copied: 'تم النسخ ✓', kb_browse_title: 'اختر الموضوع:', kb_cat_title: 'اختر سؤالك:', kb_empty: 'لا توجد أسئلة في هذا الموضوع بعد.',
    title: 'خدمة العملاء', subtitle: 'نرد عادة خلال دقائق', bot_name: 'المساعد الذكي', teaser: 'مرحباً 👋 هل تحتاج مساعدة؟',
    placeholder: 'اكتب رسالتك...', start: 'ابدأ المحادثة', end_chat: 'إنهاء المحادثة', new_chat: 'بدء محادثة جديدة', confirm_end: 'هل تريد إنهاء المحادثة؟',
    rating_title: 'كيف تقيّم تجربتك معنا؟', rating_comment: 'ملاحظاتك (اختياري)', rating_send: 'إرسال التقييم', rating_thanks: 'شكراً لتقييمك 🌟', ended: 'تم إنهاء المحادثة',
    waiting: 'جارٍ الاتصال بموظف…', with_agent: 'تتحدث مع {agent}', online: 'متصل الآن', language: 'اللغة',
    prechat_title: 'عرّفنا بنفسك قبل البدء', f_name: 'الاسم', f_phone: 'رقم الجوال', f_email: 'البريد الإلكتروني (اختياري)', f_message: 'اكتب التفاصيل هنا', f_send: 'إرسال', f_cancel: 'إلغاء', f_required: 'هذا الحقل مطلوب', f_phone_invalid: 'رقم الجوال غير صحيح',
    open_maps: 'فتح في خرائط Google', directions: 'الاتجاهات', open_file: 'فتح الملف', open_link: 'فتح الرابط ↗', visit_site: 'زيارة الموقع ↗', call: 'اتصال',
    nav_home: '🏠 القائمة الرئيسية', nav_agent: '💬 التحدث مع موظف', nav_cancel: '✖ إلغاء', nav_retry: '🔁 حاول مرة أخرى', nav_ticket: '📝 ترك رسالة',
    handoff: 'لحظات من فضلك، جارٍ تحويلك إلى أحد موظفينا 👨‍💼',
    no_answer_handoff: 'لم أجد إجابة دقيقة لسؤالك، سأحوّلك الآن إلى أحد موظفينا ليجيبك 👨‍💼',
    queue: 'ترتيبك في قائمة الانتظار: {n}', no_agents: 'لا يوجد موظف متصل حالياً. يمكنك ترك رسالة وسنرد عليك في أقرب وقت، أو الانتظار.',
    agent_joined: 'انضم {agent} إلى المحادثة', closed: 'تم إنهاء المحادثة', by_visitor: 'المستفيد', by_agent: 'الموظف', by_system: 'النظام (عدم نشاط)',
    anything_else: 'هل تحتاج شيئاً آخر؟', fallback: 'عذراً، لم أفهم سؤالك. اختر من القائمة أو اكتب سؤالك بطريقة أخرى.',
    did_you_mean: 'هل تقصد أحد هذه الأسئلة؟', unlinked: 'هذا الخيار غير مفعّل بعد، اختر خياراً آخر.', back_to_bot: 'تمت إعادة المحادثة إلى المساعد الذكي',
    ask_order_no: 'من فضلك أرسل رقم الطلب 🔢', ask_phone: 'أرسل رقم الجوال المسجل 📱', ask_email: 'أرسل بريدك الإلكتروني المسجل ✉️', ask_id_number: 'أرسل رقم الهوية', ask_param: 'من فضلك أرسل {param}',
    lookups_hub: 'ماذا تريد أن تستعلم عنه؟ 🔎', elig_src_found: '✅ وجدت بياناتك المسجلة لدينا:', elig_src_not_found: 'لم أجد بيانات مسجلة بهذه المعلومات 🙏 تأكد منها وحاول مرة أخرى، أو تواصل معنا.', elig_src_continue: 'لم أجد بيانات مسجلة، سأكمل معك بالأسئلة 👇',
    elig_hub: 'اختر نوع المساعدة لمعرفة أهليتك وقيمة استحقاقك 🧮', elig_eligible: '✅ أنت مؤهل مبدئياً لـ «{title}»', elig_amount: '💰 قيمة الاستحقاق المتوقعة: {amount} ريال', elig_not_eligible: 'نعتذر، أنت غير مؤهل حالياً لـ «{title}» 🙏', elig_reason: 'السبب: {reason}',
    elig_bad_number: 'من فضلك اكتب رقماً فقط (مثال: 3500)', elig_bad_range: 'الرقم خارج النطاق المسموح، تأكد منه واكتبه مرة أخرى', elig_bad_choice: 'من فضلك اختر رقماً من الخيارات', elig_step: 'سؤال {n} من {total}', elig_apply: '📝 قدّم طلبك الآن', elig_disclaimer: 'هذه نتيجة مبدئية، والقرار النهائي بعد دراسة الطلب.',
    invalid_value: '⚠️ {label} غير صحيح. {rule}', invalid_giveup: 'لم أتمكن من قراءة البيانات المدخلة 🙏 يمكنك المحاولة من جديد في أي وقت.',
    rule_number: 'اكتب أرقاماً فقط.', rule_phone: 'اكتب رقم جوال صحيحاً مثل 0501234567', rule_id: 'رقم الهوية 10 أرقام ويبدأ بـ 1 أو 2.', rule_email: 'اكتب بريداً صحيحاً مثل name@mail.com', rule_date: 'اكتب التاريخ مثل 2026-10-25', rule_code: 'اكتب الرقم كما هو.', rule_text: 'حاول مرة أخرى.',
    not_found: 'لم أجد طلباً مطابقاً لهذه البيانات. تأكد من الرقم وحاول مرة أخرى.', customer_not_found: 'لم أجد بيانات مسجلة بهذه المعلومات.', db_error: 'تعذر الوصول إلى النظام حالياً، يمكنك التحدث مع موظف.',
    org_missing: 'لم تتم إضافة هذه المعلومة بعد.',
    t_complaint: 'شكوى', t_suggestion: 'اقتراح', t_inquiry: 'استفسار',
    ticket_form_complaint: 'تقديم شكوى', ticket_form_suggestion: 'تقديم اقتراح',
    ticket_intro: 'يسعدنا سماعك. عبّئ النموذج التالي وسنتابع طلبك.',
    ticket_created: '✅ تم استلام {type} برقم *{number}* بتاريخ {date}.\nسنتابعها ونبلغك بأي تحديث.',
    ticket_ask_number: 'أرسل رقم الشكوى أو الاقتراح (مثال: C-1024)', ticket_not_found: 'لم أجد طلباً بهذا الرقم. تأكد من الرقم وحاول مرة أخرى.',
    ticket_status_msg: '📋 {type} رقم *{number}*\nالحالة: *{status}*\nتاريخ التقديم: {date}{reply}',
    ticket_reply_prefix: '\nالرد: ',
    s_new: 'جديدة', s_in_progress: 'قيد المعالجة', s_resolved: 'تم الحل', s_closed: 'مغلقة', s_rejected: 'مرفوضة'
  },
  en: {
    branches_title: '📍 We have several branches — choose one:', main_branch: 'Head office', branch_hours: '🕘 Working hours:',
    related_title: 'Related questions:',
    after_hours: 'Sorry, we are currently outside working hours 🌙\nWorking hours:\n{hours}\n\nLeave your name and mobile number and we will contact you on the next working day.', t_callback: 'Callback request', ticket_form_callback: 'Leave your details and we will call you back', callback_created: '✅ Your request was registered with number *{number}*.\nWe will contact you during official working hours.', closed_day: 'Closed', days: 'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', off_hours_status: 'Outside working hours',
    about_title: 'What would you like to know about us?', hours_label: '🕘 Working hours', web_social_label: '🌐 Website & social', banks_title: '🏦 Our bank accounts — choose a category:', banks_group: '🏦 {group}', banks_empty: 'No bank accounts have been added yet.', iban: 'IBAN', account_no: 'Account no.', copy: 'Copy', copied: 'Copied ✓', kb_browse_title: 'Choose a topic:', kb_cat_title: 'Choose your question:', kb_empty: 'No questions in this topic yet.',
    title: 'Customer Service', subtitle: 'We usually reply within minutes', bot_name: 'Smart Assistant', teaser: 'Hi 👋 Need help?',
    placeholder: 'Type your message...', start: 'Start chat', end_chat: 'End chat', new_chat: 'Start a new chat', confirm_end: 'End this conversation?',
    rating_title: 'How would you rate your experience?', rating_comment: 'Your feedback (optional)', rating_send: 'Send rating', rating_thanks: 'Thanks for your rating 🌟', ended: 'Conversation ended',
    waiting: 'Connecting you to an agent…', with_agent: 'Chatting with {agent}', online: 'Online', language: 'Language',
    prechat_title: 'Tell us about yourself', f_name: 'Name', f_phone: 'Mobile number', f_email: 'Email (optional)', f_message: 'Write the details here', f_send: 'Send', f_cancel: 'Cancel', f_required: 'This field is required', f_phone_invalid: 'Invalid mobile number',
    open_maps: 'Open in Google Maps', directions: 'Directions', open_file: 'Open file', open_link: 'Open link ↗', visit_site: 'Visit website ↗', call: 'Call',
    nav_home: '🏠 Main menu', nav_agent: '💬 Talk to an agent', nav_cancel: '✖ Cancel', nav_retry: '🔁 Try again', nav_ticket: '📝 Leave a message',
    handoff: 'One moment please, connecting you to one of our agents 👨‍💼',
    no_answer_handoff: "I couldn't find an exact answer, connecting you to an agent now 👨‍💼",
    queue: 'Your position in the queue: {n}', no_agents: 'No agent is online right now. You can leave a message and we will get back to you, or keep waiting.',
    agent_joined: '{agent} joined the conversation', closed: 'Conversation ended', by_visitor: 'visitor', by_agent: 'agent', by_system: 'system (inactivity)',
    anything_else: 'Anything else I can help with?', fallback: "Sorry, I didn't understand. Choose from the menu or rephrase your question.",
    did_you_mean: 'Did you mean one of these?', unlinked: 'This option is not available yet, please choose another.', back_to_bot: 'Conversation returned to the assistant',
    ask_order_no: 'Please send your order number 🔢', ask_phone: 'Please send your registered mobile number 📱', ask_email: 'Please send your registered email ✉️', ask_id_number: 'Please send your ID number', ask_param: 'Please send {param}',
    lookups_hub: 'What would you like to look up? 🔎', elig_src_found: '✅ I found your registered details:', elig_src_not_found: "I couldn't find registered details with this information 🙏 Please check and try again, or contact us.", elig_src_continue: "I couldn't find registered details, so I'll ask you a few questions 👇",
    elig_hub: 'Choose the type of aid to check your eligibility 🧮', elig_eligible: '✅ You are initially eligible for “{title}”', elig_amount: '💰 Expected entitlement: {amount} SAR', elig_not_eligible: 'Sorry, you are not eligible for “{title}” at the moment 🙏', elig_reason: 'Reason: {reason}',
    elig_bad_number: 'Please type a number only (e.g. 3500)', elig_bad_range: 'The number is out of the allowed range, please check it', elig_bad_choice: 'Please choose a number from the options', elig_step: 'Question {n} of {total}', elig_apply: '📝 Apply now', elig_disclaimer: 'This is an initial result; the final decision follows a review of your application.',
    invalid_value: '⚠️ The {label} is not valid. {rule}', invalid_giveup: "I couldn't read the details you entered 🙏 You can try again any time.",
    rule_number: 'Please type digits only.', rule_phone: 'Please type a valid mobile number, e.g. 0501234567', rule_id: 'The ID number is 10 digits starting with 1 or 2.', rule_email: 'Please type a valid email, e.g. name@mail.com', rule_date: 'Please type the date like 2026-10-25', rule_code: 'Please type it exactly as shown.', rule_text: 'Please try again.',
    not_found: 'No matching order found. Please check the number and try again.', customer_not_found: 'No records found with this information.', db_error: 'The system is unavailable right now, you can talk to an agent.',
    org_missing: 'This information has not been added yet.',
    t_complaint: 'Complaint', t_suggestion: 'Suggestion', t_inquiry: 'Inquiry',
    ticket_form_complaint: 'Submit a complaint', ticket_form_suggestion: 'Submit a suggestion',
    ticket_intro: 'We are glad to hear from you. Fill in the form below and we will follow up.',
    ticket_created: '✅ Your {type} was received with number *{number}* on {date}.\nWe will keep you updated.',
    ticket_ask_number: 'Send the ticket number (e.g. C-1024)', ticket_not_found: 'No ticket found with this number. Please check and try again.',
    ticket_status_msg: '📋 {type} *{number}*\nStatus: *{status}*\nSubmitted: {date}{reply}',
    ticket_reply_prefix: '\nReply: ',
    s_new: 'New', s_in_progress: 'In progress', s_resolved: 'Resolved', s_closed: 'Closed', s_rejected: 'Rejected'
  },
  ur: {
    branches_title: '📍 ہماری کئی شاخیں ہیں — شاخ منتخب کریں:', main_branch: 'مرکزی دفتر', branch_hours: '🕘 اوقات کار:',
    related_title: 'متعلقہ سوالات:',
    after_hours: 'معذرت، اس وقت دفتری اوقات ختم ہو چکے ہیں 🌙\nاوقات کار:\n{hours}\n\nاپنا نام اور موبائل نمبر چھوڑیں، ہم اگلے کام کے دن آپ سے رابطہ کریں گے۔', t_callback: 'رابطے کی درخواست', ticket_form_callback: 'اپنی تفصیلات چھوڑیں، ہم رابطہ کریں گے', callback_created: '✅ آپ کی درخواست نمبر *{number}* کے ساتھ درج ہو گئی۔\nہم دفتری اوقات میں آپ سے رابطہ کریں گے۔', closed_day: 'بند', days: 'اتوار,پیر,منگل,بدھ,جمعرات,جمعہ,ہفتہ', off_hours_status: 'دفتری اوقات کے بعد',
    about_title: 'آپ ہمارے بارے میں کیا جاننا چاہتے ہیں؟', hours_label: '🕘 اوقات کار', web_social_label: '🌐 ویب سائٹ اور سوشل میڈیا', banks_title: '🏦 ہمارے بینک اکاؤنٹس — زمرہ منتخب کریں:', banks_group: '🏦 {group}', banks_empty: 'ابھی کوئی بینک اکاؤنٹ شامل نہیں کیا گیا۔', iban: 'IBAN', account_no: 'اکاؤنٹ نمبر', copy: 'کاپی', copied: 'کاپی ہو گیا ✓', kb_browse_title: 'موضوع منتخب کریں:', kb_cat_title: 'اپنا سوال منتخب کریں:', kb_empty: 'اس موضوع میں ابھی کوئی سوال نہیں۔',
    title: 'کسٹمر سروس', subtitle: 'ہم عام طور پر چند منٹوں میں جواب دیتے ہیں', bot_name: 'سمارٹ اسسٹنٹ', teaser: 'السلام علیکم 👋 کیا آپ کو مدد چاہیے؟',
    placeholder: 'اپنا پیغام لکھیں...', start: 'گفتگو شروع کریں', end_chat: 'گفتگو ختم کریں', new_chat: 'نئی گفتگو شروع کریں', confirm_end: 'کیا آپ گفتگو ختم کرنا چاہتے ہیں؟',
    rating_title: 'آپ ہماری سروس کو کیسا درجہ دیں گے؟', rating_comment: 'آپ کی رائے (اختیاری)', rating_send: 'درجہ بندی بھیجیں', rating_thanks: 'آپ کی رائے کا شکریہ 🌟', ended: 'گفتگو ختم ہو گئی',
    waiting: 'نمائندے سے رابطہ ہو رہا ہے…', with_agent: '{agent} سے گفتگو جاری ہے', online: 'آن لائن', language: 'زبان',
    prechat_title: 'شروع کرنے سے پہلے اپنا تعارف کروائیں', f_name: 'نام', f_phone: 'موبائل نمبر', f_email: 'ای میل (اختیاری)', f_message: 'تفصیل یہاں لکھیں', f_send: 'بھیجیں', f_cancel: 'منسوخ کریں', f_required: 'یہ خانہ ضروری ہے', f_phone_invalid: 'موبائل نمبر درست نہیں',
    open_maps: 'گوگل میپس میں کھولیں', directions: 'راستہ', open_file: 'فائل کھولیں', open_link: 'لنک کھولیں ↗', visit_site: 'ویب سائٹ دیکھیں ↗', call: 'کال کریں',
    nav_home: '🏠 مین مینو', nav_agent: '💬 نمائندے سے بات کریں', nav_cancel: '✖ منسوخ', nav_retry: '🔁 دوبارہ کوشش کریں', nav_ticket: '📝 پیغام چھوڑیں',
    handoff: 'براہ کرم انتظار کریں، آپ کو ہمارے نمائندے سے ملایا جا رہا ہے 👨‍💼',
    no_answer_handoff: 'مجھے آپ کے سوال کا درست جواب نہیں ملا، آپ کو نمائندے سے ملایا جا رہا ہے 👨‍💼',
    queue: 'قطار میں آپ کا نمبر: {n}', no_agents: 'اس وقت کوئی نمائندہ دستیاب نہیں۔ آپ پیغام چھوڑ سکتے ہیں، ہم جلد جواب دیں گے۔',
    agent_joined: '{agent} گفتگو میں شامل ہو گئے', closed: 'گفتگو ختم ہو گئی', by_visitor: 'صارف', by_agent: 'نمائندہ', by_system: 'سسٹم (غیر فعالیت)',
    anything_else: 'کیا آپ کو کسی اور چیز کی ضرورت ہے؟', fallback: 'معذرت، میں سمجھ نہیں سکا۔ مینو سے انتخاب کریں یا سوال دوسرے انداز میں لکھیں۔',
    did_you_mean: 'کیا آپ کا مطلب ان میں سے کوئی سوال ہے؟', unlinked: 'یہ آپشن ابھی دستیاب نہیں، کوئی اور منتخب کریں۔', back_to_bot: 'گفتگو دوبارہ اسسٹنٹ کو منتقل کر دی گئی',
    ask_order_no: 'براہ کرم آرڈر نمبر بھیجیں 🔢', ask_phone: 'براہ کرم رجسٹرڈ موبائل نمبر بھیجیں 📱', ask_email: 'براہ کرم رجسٹرڈ ای میل بھیجیں ✉️', ask_id_number: 'براہ کرم شناختی نمبر بھیجیں', ask_param: 'براہ کرم {param} بھیجیں',
    lookups_hub: 'آپ کیا معلوم کرنا چاہتے ہیں؟ 🔎', elig_src_found: '✅ آپ کی رجسٹرڈ معلومات مل گئیں:', elig_src_not_found: 'ان معلومات کے ساتھ کوئی ریکارڈ نہیں ملا 🙏 دوبارہ کوشش کریں یا ہم سے رابطہ کریں۔', elig_src_continue: 'کوئی ریکارڈ نہیں ملا، میں آپ سے چند سوالات پوچھوں گا 👇',
    elig_hub: 'اہلیت جاننے کے لیے امداد کی قسم منتخب کریں 🧮', elig_eligible: '✅ آپ ابتدائی طور پر «{title}» کے اہل ہیں', elig_amount: '💰 متوقع رقم: {amount} ریال', elig_not_eligible: 'معذرت، آپ فی الحال «{title}» کے اہل نہیں ہیں 🙏', elig_reason: 'وجہ: {reason}',
    elig_bad_number: 'براہ کرم صرف نمبر لکھیں (مثلاً 3500)', elig_bad_range: 'نمبر اجازت شدہ حد سے باہر ہے', elig_bad_choice: 'براہ کرم آپشنز میں سے نمبر منتخب کریں', elig_step: 'سوال {n} از {total}', elig_apply: '📝 ابھی درخواست دیں', elig_disclaimer: 'یہ ابتدائی نتیجہ ہے، حتمی فیصلہ درخواست کے جائزے کے بعد ہوگا۔',
    invalid_value: '⚠️ {label} درست نہیں۔ {rule}', invalid_giveup: 'میں درج کردہ معلومات نہیں پڑھ سکا 🙏 آپ کسی بھی وقت دوبارہ کوشش کر سکتے ہیں۔',
    rule_number: 'صرف ہندسے لکھیں۔', rule_phone: 'درست موبائل نمبر لکھیں، مثلاً 0501234567', rule_id: 'شناختی نمبر 10 ہندسوں کا ہے اور 1 یا 2 سے شروع ہوتا ہے۔', rule_email: 'درست ای میل لکھیں، مثلاً name@mail.com', rule_date: 'تاریخ اس طرح لکھیں 2026-10-25', rule_code: 'بالکل اسی طرح لکھیں۔', rule_text: 'دوبارہ کوشش کریں۔',
    not_found: 'اس معلومات سے کوئی آرڈر نہیں ملا۔ نمبر چیک کر کے دوبارہ کوشش کریں۔', customer_not_found: 'اس معلومات سے کوئی ریکارڈ نہیں ملا۔', db_error: 'سسٹم اس وقت دستیاب نہیں، آپ نمائندے سے بات کر سکتے ہیں۔',
    org_missing: 'یہ معلومات ابھی شامل نہیں کی گئی۔',
    t_complaint: 'شکایت', t_suggestion: 'تجویز', t_inquiry: 'استفسار',
    ticket_form_complaint: 'شکایت درج کریں', ticket_form_suggestion: 'تجویز دیں',
    ticket_intro: 'ہمیں آپ کی بات سن کر خوشی ہوگی۔ فارم پُر کریں، ہم آپ سے رابطہ کریں گے۔',
    ticket_created: '✅ آپ کی {type} نمبر *{number}* کے ساتھ {date} کو موصول ہو گئی۔\nہم آپ کو ہر اپڈیٹ سے آگاہ کریں گے۔',
    ticket_ask_number: 'شکایت یا تجویز کا نمبر بھیجیں (مثال: C-1024)', ticket_not_found: 'اس نمبر سے کوئی درخواست نہیں ملی۔',
    ticket_status_msg: '📋 {type} نمبر *{number}*\nحالت: *{status}*\nتاریخ: {date}{reply}',
    ticket_reply_prefix: '\nجواب: ',
    s_new: 'نئی', s_in_progress: 'زیر کارروائی', s_resolved: 'حل ہو گئی', s_closed: 'بند', s_rejected: 'مسترد'
  }
};

// Keywords that detect common intents in every language (normalized matching).
const INTENTS = {
  handoff: ['موظف', 'بشري', 'خدمة العملاء', 'شخص حقيقي', 'اكلم احد', 'agent', 'human', 'representative', 'نمائندہ', 'انسان سے'],
  order: ['حالة الطلب', 'حالة طلبي', 'وين طلبي', 'تتبع الطلب', 'تتبع طلب', 'order status', 'track order', 'where is my order', 'آرڈر کی حالت'],
  location: ['الموقع الجغرافي', 'موقعكم', 'لوكيشن', 'اللوكيشن', 'وين مكانكم', 'وين موقعكم', 'عنوانكم', 'العنوان', 'خريطة', 'قوقل ماب', 'location', 'address', 'where are you', 'map', 'مقام', 'پتہ', 'لوکیشن'],
  history: ['تاريخ الجمعية', 'تاريخ الشركة', 'نبذة', 'من انتم', 'من أنتم', 'تعريف', 'عن الجمعية', 'عن الشركة', 'about you', 'who are you', 'history', 'about us', 'ہمارے بارے', 'تعارف'],
  vision: ['رؤية', 'رسالة الجمعية', 'رسالتكم', 'اهدافكم', 'أهدافكم', 'vision', 'mission', 'goals', 'وژن'],
  contact: ['رقم التواصل', 'ارقام التواصل', 'أرقام التواصل', 'رقمكم', 'الرقم الموحد', 'رقم الجوال', 'اتصل', 'تواصل معكم', 'ايميل', 'البريد', 'contact', 'phone', 'email', 'call you', 'رابطہ', 'فون'],
  hours: ['ساعات العمل', 'الدوام', 'اوقات العمل', 'أوقات العمل', 'متى تفتحون', 'working hours', 'opening hours', 'open', 'اوقات کار'],
  website: ['موقعكم الالكتروني', 'الموقع الإلكتروني', 'الموقع الالكتروني', 'رابط الموقع', 'website', 'web site', 'ویب سائٹ'],
  social: ['تويتر', 'انستقرام', 'سناب', 'حسابات التواصل', 'تابعونا', 'social', 'instagram', 'twitter', 'سوشل'],
  developer: ['من صمم', 'من برمج', 'من طور', 'من سوى', 'المطور', 'الشركة المطورة', 'who made', 'who developed', 'developer', 'built by', 'کس نے بنایا'],
  complaint: ['شكوى', 'اشتكي', 'أشتكي', 'complaint', 'complain', 'شکایت'],
  suggestion: ['اقتراح', 'مقترح', 'suggestion', 'suggest', 'تجویز'],
  eligibility: ['الاستحقاق', 'آلية الاستحقاق', 'الية الاستحقاق', 'حساب الاستحقاق', 'هل انا مستحق', 'هل أنا مستحق', 'هل انا مؤهل', 'هل أنا مؤهل', 'شروط المساعدة', 'شروط الاستحقاق', 'eligibility', 'am i eligible', 'اہلیت'],
  banks: ['رقم الحساب', 'ارقام الحسابات', 'أرقام الحسابات', 'الحسابات البنكية', 'حسابات بنكية', 'حساب بنكي', 'الحساب البنكي', 'ايبان', 'آيبان', 'الايبان', 'الآيبان', 'تبرع', 'اتبرع', 'أتبرع', 'التبرع', 'حواله', 'حوالة', 'iban', 'bank account', 'donate', 'donation', 'بینک', 'اکاؤنٹ', 'عطیہ'],
  branches: ['فرع', 'فروع', 'الفروع', 'فروعكم', 'الفرع', 'branch', 'branches', 'برانچ', 'شاخ', 'شاخیں'],
  about: ['عن الجمعية', 'عنكم', 'تعرف علينا', 'تعرّف علينا', 'معلومات عن الجمعية', 'about', 'ہمارا تعارف'],
  ticket_status: ['حالة الشكوى', 'حالة الاقتراح', 'متابعة شكوى', 'متابعة الشكوى', 'رقم الشكوى', 'ticket status', 'complaint status', 'شکایت کی حالت']
};

function texts(site, lang) {
  const l = LANGS[lang] ? lang : 'ar';
  const custom = (site?.settings?.texts && site.settings.texts[l]) || {};
  const out = { ...T.ar, ...T[l] };
  for (const k of Object.keys(custom)) if (custom[k] !== '' && custom[k] != null) out[k] = custom[k];
  return out;
}

module.exports = { LANGS, T, INTENTS, texts };
