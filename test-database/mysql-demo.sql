-- =====================================================================
--  بيانات تجريبية لربط المساعد الذكي — MySQL / MariaDB (phpMyAdmin)
--  الصق الملف كاملاً في تبويب SQL ثم اضغط «يذهب»
--  آمن للتشغيل أكثر من مرة (يحذف الجداول التجريبية ويعيد إنشاءها)
-- =====================================================================

SET NAMES utf8mb4;

DROP TABLE IF EXISTS demo_disbursements;
DROP TABLE IF EXISTS demo_aid_requests;
DROP TABLE IF EXISTS demo_beneficiaries;

-- المستفيدون
CREATE TABLE demo_beneficiaries (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  id_number     VARCHAR(10)  NOT NULL UNIQUE,   -- رقم الهوية
  full_name     VARCHAR(100) NOT NULL,          -- الاسم
  phone         VARCHAR(15)  NOT NULL,          -- الجوال
  city          VARCHAR(50),                    -- المدينة
  district      VARCHAR(50),                    -- الحي
  family_size   INT,                            -- عدد أفراد الأسرة
  category      VARCHAR(50),                    -- الفئة
  file_status   VARCHAR(50)                     -- حالة الملف
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- طلبات المساعدة
CREATE TABLE demo_aid_requests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  request_no     VARCHAR(10) NOT NULL UNIQUE,   -- رقم الطلب
  beneficiary_id INT,
  phone          VARCHAR(15) NOT NULL,          -- جوال مقدم الطلب
  aid_type       VARCHAR(50),                   -- نوع المساعدة
  status         VARCHAR(50),                   -- حالة الطلب
  notes          VARCHAR(255),                  -- ملاحظات للمستفيد
  created_at     DATE,
  FOREIGN KEY (beneficiary_id) REFERENCES demo_beneficiaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- مواعيد الصرف
CREATE TABLE demo_disbursements (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_id INT,
  aid_type       VARCHAR(50),                   -- نوع الصرف
  amount         DECIMAL(10,2),                 -- المبلغ
  next_date      DATE,                          -- موعد الصرف القادم
  place          VARCHAR(100),                  -- مكان / طريقة الاستلام
  FOREIGN KEY (beneficiary_id) REFERENCES demo_beneficiaries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO demo_beneficiaries (id_number, full_name, phone, city, district, family_size, category, file_status) VALUES
('1012345678', 'أحمد محمد العتيبي',  '0501234567', 'المدينة المنورة', 'العزيزية', 6, 'أسرة محتاجة', 'مكتمل ومعتمد'),
('1023456789', 'سارة علي القحطاني',  '0552345678', 'المدينة المنورة', 'قباء',     4, 'أرملة',       'مكتمل ومعتمد'),
('1034567890', 'خالد سعد الدوسري',   '0563456789', 'المدينة المنورة', 'العوالي',   3, 'كبار السن',   'قيد المراجعة'),
('1045678901', 'نورة فهد الشهري',    '0544567890', 'المدينة المنورة', 'الحرة الشرقية', 5, 'أيتام',  'ينقصه مستندات');

INSERT INTO demo_aid_requests (request_no, beneficiary_id, phone, aid_type, status, notes, created_at) VALUES
('1001', 1, '0501234567', 'سلة غذائية',   'تمت الموافقة',  'الاستلام من مستودع الجمعية يوم الأحد',   '2026-10-01'),
('1002', 2, '0552345678', 'إعانة مالية',  'قيد الدراسة',   NULL,                                    '2026-10-08'),
('1003', 3, '0563456789', 'أجهزة منزلية', 'بانتظار الزيارة', 'سيتواصل معك الباحث الاجتماعي خلال أسبوع', '2026-10-12'),
('1004', 4, '0544567890', 'كسوة',         'مرفوض',         'يرجى استكمال صك الولاية ثم التقديم مجدداً', '2026-10-15');

INSERT INTO demo_disbursements (beneficiary_id, aid_type, amount, next_date, place) VALUES
(1, 'مساعدة شهرية', 800.00,  '2026-10-25', 'تحويل بنكي'),
(2, 'مساعدة شهرية', 1000.00, '2026-10-25', 'تحويل بنكي'),
(3, 'سلة غذائية',   0.00,    '2026-11-02', 'مستودع الجمعية'),
(4, 'كسوة الشتاء',  0.00,    '2026-11-15', 'مقر الجمعية');

SELECT 'تم إنشاء البيانات التجريبية ✅' AS result,
       (SELECT COUNT(*) FROM demo_beneficiaries) AS beneficiaries,
       (SELECT COUNT(*) FROM demo_aid_requests)  AS requests;
