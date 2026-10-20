# بيانات تجريبية للربط

| الملف | الاستخدام |
|---|---|
| `supabase-demo.sql` | قاعدة PostgreSQL تجريبية (مستفيدون، طلبات مساعدة، مواعيد صرف) + مستخدم قراءة فقط `chatbot_reader`. شغّله في Supabase ← SQL Editor. |
| `mysql-demo.sql` | نفس البيانات لـ MySQL / MariaDB: الصقه في phpMyAdmin ← تبويب SQL ← «يذهب». |
| `beneficiaries-sample.xlsx` | جرّب نوع «ملف Excel / CSV»: ارفعه من الإعدادات ← قواعد البيانات. |
| `beneficiaries-sample.csv` | نفس البيانات بصيغة CSV (يمكن رفعه لـ Google Sheets وتجربة نوع «Google Sheets»). |

## استعلامات جاهزة

**Supabase (PostgreSQL)**
```sql
-- حالة طلب المساعدة
SELECT status, aid_type, notes FROM charity.aid_requests WHERE request_no = :request_no AND phone = :phone
-- ملف المستفيد
SELECT full_name, city, family_size, file_status FROM charity.beneficiaries WHERE id_number = :id_number
-- موعد الصرف
SELECT d.aid_type, d.amount, d.next_date, d.place FROM charity.disbursements d JOIN charity.beneficiaries b ON b.id = d.beneficiary_id WHERE b.id_number = :id_number ORDER BY d.next_date LIMIT 1
```

**ملف Excel أو Google Sheets**
```sql
SELECT full_name, next_date, aid_type FROM data WHERE id_number = :id_number
```

رابط الاتصال في Supabase: Project Settings ← Database ← Connection string ← **Session pooler**، واستبدل اسم المستخدم بـ `chatbot_reader.<project-ref>` وكلمة المرور بالتي في الملف (غيّرها قبل الاستخدام الفعلي).

**MySQL (phpMyAdmin)**
```sql
SELECT status, aid_type, notes FROM demo_aid_requests WHERE request_no = :request_no AND phone = :phone
SELECT full_name, city, family_size, file_status FROM demo_beneficiaries WHERE id_number = :id_number
SELECT d.aid_type, d.amount, d.next_date, d.place FROM demo_disbursements d JOIN demo_beneficiaries b ON b.id = d.beneficiary_id WHERE b.id_number = :id_number ORDER BY d.next_date LIMIT 1
```
> ⚠️ الاستضافات المجانية مثل InfinityFree لا تسمح بالاتصال بقاعدة MySQL من خارجها، فلن يصل إليها البوت المستضاف على Render. للربط الفعلي استخدم استضافة تدعم Remote MySQL، أو Supabase، أو Google Sheets / Excel.
