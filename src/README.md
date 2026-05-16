# Aldhafra IMS v2.0 — Source Code

كود Google Apps Script لنظام إدارة مخزون الظفرة.
التوثيق الكامل في [`../docs/implementation/`](../docs/implementation/).

---

## بنية المشروع

```
src/
├── appsscript.json          ← Apps Script manifest
│
├── Code.gs                  ← doGet + router + include()
├── Config.gs                ← الثوابت + getSpreadsheet_() + getSheet_()
├── setup.gs                 ← يُشغَّل مرة واحدة لإنشاء كل الجداول
│
├── AuthService.gs           ← المصادقة من Users_Stores
├── LockService.gs           ← withLock() لحماية التزامن
├── AuditService.gs          ← كتابة Audit_Log
├── DataService.gs           ← قراءة Master_Items / Locations / Balance
├── TransactionService.gs    ← submitTransaction (المنطق الكامل)
├── AdminService.gs          ← CRUD على Users / Items / Locations
├── ReportService.gs         ← Dashboard / Ledger / Export / Audit
│
├── Index.html               ← Shell الرئيسي + Navigation
├── styles.html              ← CSS مشترك
├── scripts.html              ← JS مشترك (API bridge، toast، router)
├── ErrorUnauthorized.html   ← صفحة رفض الدخول
│
└── view_*.html              ← كل شاشة في ملف منفصل:
    ├── view_entry.html      ← نموذج المعاملة
    ├── view_stock.html      ← مخزون الأمين
    ├── view_history.html    ← سجل الأمين
    ├── view_dashboard.html  ← لوحة الأدمن
    ├── view_ledger.html     ← دفتر الحركات الكامل
    ├── view_allstock.html   ← أرصدة كل المخازن
    ├── view_admin.html      ← إدارة Users/Items/Locations
    └── view_audit.html      ← سجل المراجعة
```

---

## خطوات النشر (مختصر)

### 1. إنشاء Google Sheets
```
sheets.google.com → ملف جديد → سمّه: "Aldhafra IMS — Backend Data"
```
احفظ الـ Spreadsheet ID من URL.

### 2. ربط Apps Script

**الخيار أ — مرتبط بالـ Sheet (موصى به):**
- في Google Sheets: `Extensions → Apps Script`
- اترك `CONFIG.SPREADSHEET_ID = null` في `Config.gs`

**الخيار ب — مشروع مستقل:**
- `script.google.com → New project`
- ضع الـ Spreadsheet ID في `Config.gs`:
  ```javascript
  SPREADSHEET_ID: 'YOUR_ID_HERE',
  ```

### 3. رفع الكود
- أنشئ كل ملف `.gs` و `.html` في محرر Apps Script
- انسخ المحتوى من هذا المجلد لكل ملف
- **أو** استخدم `clasp`:
  ```bash
  npm install -g @google/clasp
  clasp login
  clasp create --rootDir ./src --title "Aldhafra IMS"
  clasp push
  ```

### 4. تشغيل setup مرة واحدة
- في محرر Apps Script، اختر الدالة `setupSpreadsheet`
- اضغط `Run`
- اقبل OAuth permissions
- تحقق من Logs أن كل الأوراق تم إنشاؤها

### 5. نشر Web App
- `Deploy → New deployment`
- النوع: **Web app**
- Execute as: **Me (owner)**
- Who has access: **Anyone with a Google account**
- Deploy → احفظ الـ URL

### 6. التحقق
- افتح الـ URL بحساب الأدمن (نفس الذي شغّل setup) → يجب أن يفتح Dashboard
- افتح الـ URL بحساب آخر غير مسجل → يجب أن يظهر خطأ "غير مصرح"

### 7. إضافة المستخدمين
- من Dashboard → إدارة → المستخدمون → + إضافة مستخدم
- أضف بريد كل أمين مخزن مع تحديد مخزنه ودوره (Keeper)

---

## الاختبار السريع

| الاختبار | المتوقع |
|---------|---------|
| فتح بحساب الأدمن | Dashboard يفتح |
| فتح بحساب غير مسجل | ErrorUnauthorized |
| تسجيل استلام | يُحفظ + الرصيد يرتفع |
| محاولة صرف أكثر من الرصيد | يُرفض مع رسالة الرصيد |
| تحويل بين مخزنين | صفان في Stock_Movement (OUT + IN) |
| Adjustment يُعطي رصيداً سالباً | تحذير قبل المتابعة |

تفاصيل اختبارات أكثر في [08-TESTING-PLAN.md](../docs/implementation/08-TESTING-PLAN.md).

---

## التحديثات اللاحقة

كل تعديل على الكود يتطلب:
```
Deploy → Manage deployments → ⚙ → Version: New version → Deploy
```

أو لاختبار سريع بدون نشر جديد: استخدم رابط `/dev` (Test deployments).

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| "Sheet not found" | شغّل `setupSpreadsheet()` مرة |
| "UNAUTHORIZED" | تحقق أن البريد في Users_Stores وIsActive=TRUE |
| "SYSTEM_BUSY" | LockService timeout — أعد المحاولة |
| Logs لا تظهر | `View → Executions` في محرر Apps Script |
| تغييرات لا تسري | احفظ + Deploy جديد (Ctrl+S لا يكفي للنشر) |

---

## المراجع

- [docs/implementation/](../docs/implementation/) — التوثيق الكامل (12 ملف)
- [09-DEPLOYMENT-GUIDE.md](../docs/implementation/09-DEPLOYMENT-GUIDE.md) — دليل نشر تفصيلي
- [08-TESTING-PLAN.md](../docs/implementation/08-TESTING-PLAN.md) — حالات الاختبار
- [04-BUSINESS-LOGIC.md](../docs/implementation/04-BUSINESS-LOGIC.md) — قواعد المعاملات
