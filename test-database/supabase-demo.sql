-- =====================================================================
--  قاعدة بيانات تجريبية للجمعية — للربط مع المساعد الذكي
--  الصقه كاملاً في Supabase ← SQL Editor ← New query ← Run
--  ينشئ جداول داخل مخطط (schema) مستقل اسمه charity، ومستخدماً للقراءة فقط
-- =====================================================================

create schema if not exists charity;

-- 1) المستفيدون
drop table if exists charity.disbursements;
drop table if exists charity.aid_requests;
drop table if exists charity.beneficiaries;

create table charity.beneficiaries (
  id            serial primary key,
  id_number     varchar(10) unique not null,   -- رقم الهوية
  full_name     text not null,
  phone         varchar(10) not null,           -- 05xxxxxxxx
  city          text,
  district      text,
  family_size   int,
  category      text,                           -- فئة الأسرة (أ / ب / ج)
  file_status   text not null,                  -- حالة الملف
  last_update   date default current_date
);

-- 2) طلبات المساعدة (يستعلم عنها البوت كـ «حالة الطلب»)
create table charity.aid_requests (
  request_no    varchar(10) primary key,        -- رقم الطلب
  beneficiary_id int references charity.beneficiaries(id),
  phone         varchar(10) not null,
  aid_type      text not null,
  status        text not null,
  notes         text,
  created_at    date default current_date
);

-- 3) مواعيد الصرف
create table charity.disbursements (
  id            serial primary key,
  beneficiary_id int references charity.beneficiaries(id),
  aid_type      text not null,
  amount        numeric(10,2),
  next_date     date not null,
  place         text
);

insert into charity.beneficiaries (id_number, full_name, phone, city, district, family_size, category, file_status) values
 ('1012345678', 'أحمد محمد العتيبي',  '0500000001', 'المدينة المنورة', 'العوالي', 6, 'أ', 'مكتمل ومعتمد'),
 ('1023456789', 'فاطمة علي الحربي',   '0500000002', 'المدينة المنورة', 'قباء',    4, 'ب', 'بانتظار تحديث صك الإعالة'),
 ('1034567890', 'خالد سعد الجهني',    '0500000003', 'المدينة المنورة', 'العزيزية', 8, 'أ', 'مكتمل ومعتمد'),
 ('1045678901', 'نورة عبدالله المطيري','0500000004', 'المدينة المنورة', 'الحرة الشرقية', 3, 'ج', 'تحت الدراسة');

insert into charity.aid_requests (request_no, beneficiary_id, phone, aid_type, status, notes) values
 ('1001', 1, '0500000001', 'سلة غذائية',         'تمت الموافقة',   'الاستلام من مستودع الجمعية يوم الأحد'),
 ('1002', 2, '0500000002', 'مساعدة إيجار',        'تحت الدراسة',    'مطلوب إرفاق عقد الإيجار الموثّق'),
 ('1003', 3, '0500000003', 'أجهزة كهربائية',      'تم التسليم',     null),
 ('1004', 4, '0500000004', 'كفالة يتيم',          'بانتظار الزيارة الميدانية', 'سيتواصل معك الباحث الاجتماعي');

insert into charity.disbursements (beneficiary_id, aid_type, amount, next_date, place) values
 (1, 'مساعدة شهرية', 800,  current_date + 5,  'تحويل بنكي'),
 (1, 'سلة غذائية',   null, current_date + 12, 'مستودع الجمعية — العوالي'),
 (2, 'مساعدة شهرية', 600,  current_date + 5,  'تحويل بنكي'),
 (3, 'مساعدة شهرية', 1000, current_date + 5,  'تحويل بنكي'),
 (4, 'كفالة يتيم',   500,  current_date + 20, 'تحويل بنكي');

-- 4) مستخدم للقراءة فقط (البوت لا يستطيع التعديل أو الحذف)
--    ⚠️ غيّر كلمة المرور قبل التشغيل
do $$ begin
  if not exists (select from pg_roles where rolname = 'chatbot_reader') then
    create role chatbot_reader login password 'Change_This_Pass_2026';
  end if;
end $$;
grant usage on schema charity to chatbot_reader;
grant select on all tables in schema charity to chatbot_reader;
alter default privileges in schema charity grant select on tables to chatbot_reader;

-- تحقق:
select 'تم إنشاء البيانات التجريبية ✅' as result, (select count(*) from charity.beneficiaries) as beneficiaries, (select count(*) from charity.aid_requests) as requests;
