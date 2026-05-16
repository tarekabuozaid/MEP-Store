# دليل النشر — Aldhafra IMS v2.0
## من الصفر إلى نظام يعمل

---

## المتطلبات الأساسية

- [ ] حساب Google (Gmail) للمالك/الأدمن
- [ ] متصفح Chrome أو Firefox
- [ ] (للتطوير المحلي) Node.js npm + **`@google/clasp`** — راجع قسم «النشر عبر clasp» أدناه

---

## المرحلة 1: إنشاء Google Sheets

### الخطوة 1.1 — إنشاء ملف Google Sheets جديد

1. افتح [sheets.google.com](https://sheets.google.com)
2. أنشئ ملفاً جديداً
3. سمّه: `Aldhafra IMS — Backend Data`
4. **احفظ الـ Spreadsheet ID** من URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

### الخطوة 1.2 — إنشاء أوراق العمل

احذف "Sheet1" الافتراضية وأنشئ الأوراق التالية بهذه الأسماء بالضبط:

| اسم الورقة | اللون المقترح |
|-----------|-------------|
| `Stock_Movement` | أحمر |
| `Master_Items` | أخضر |
| `Locations` | أزرق |
| `Users_Stores` | بنفسجي |
| `Counters` | رمادي |
| `Audit_Log` | برتقالي |

### الخطوة 1.3 — إنشاء رؤوس الأعمدة

**Stock_Movement (الصف 1):**
```
TxnID | Date | TxnType | ItemCode | ItemName | Unit | Qty | Location | LPO | Supplier | Requester | Receiver | Notes | UserEmail | Timestamp
```

**Master_Items (الصف 1):**
```
ItemCode | ItemName | Unit | MinStock | Category | IsActive
```

**Locations (الصف 1):**
```
StoreCode | StoreName | IsActive
```

**Users_Stores (الصف 1):**
```
Email | StoreCode | Role | FullName | IsActive | AddedDate
```

**Counters (الصف 1 + صفوف بيانات مبدئية):**
```
Prefix | Year | LastSeq
REC    | 2026 | 0
ISS    | 2026 | 0
ADJ    | 2026 | 0
TRF    | 2026 | 0
```

**Audit_Log (الصف 1):**
```
LogID | Timestamp | UserEmail | Action | Entity | EntityID | Details
```

### الخطوة 1.4 — إضافة بيانات مبدئية

**Locations — أضف مخازنك:**
```
MZ | مدينة زايد | TRUE
L  | ليوا        | TRUE
```

**Users_Stores — أضف حساب الأدمن:**
```
your-email@gmail.com | * | Admin | مدير النظام | TRUE | 2026-05-15
```

### الخطوة 1.5 — تأمين الأوراق

1. انقر يمين على كل ورقة → `Protect sheet`
2. عيّن: "Only you can edit"
3. أضف استثناء لـ `Users_Stores` لو أردت تعديلها يدوياً أحياناً

---

## المرحلة 2: إنشاء مشروع Apps Script

### الخطوة 2.1 — ربط Script بالـ Spreadsheet

1. في Google Sheets: `Extensions → Apps Script`
2. سيفتح محرر Apps Script مرتبطاً بنفس الملف

**أو** إنشاء مستقل:
1. افتح [script.google.com](https://script.google.com)
2. أنشئ مشروعاً جديداً
3. في `Code.gs` أضف في البداية:
```javascript
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
```

### الخطوة 2.2 — إنشاء ملفات المشروع

**المستودع المرجعي (MEP-Store):** المصدر الموحَّد هو مجلّد `src/` في [MEP-Store على GitHub](https://github.com/tarekabuozaid/MEP-Store).

ملفات **`.gs`** (Script):
- `Config.gs` — إعدادات (مثل `SPREADSHEET_ID`)
- `setup.gs` — مهام الإعداد الأولي (إن وُجدت)
- `Code.gs` — نقطة الدخول (`doGet` / `doPost`)
- `AuthService.gs`، `LockService.gs`، `AuditService.gs`
- `DataService.gs`، `TransactionService.gs`
- `AdminService.gs`، `ReportService.gs`

ملفات **HTML** (واجهة `HtmlService` + أجزاء):
- `Index.html`، `styles.html`، `scripts.html`
- `ErrorUnauthorized.html`
- `view_entry.html`، `view_stock.html`، `view_history.html`، `view_dashboard.html`
- `view_ledger.html`، `view_allstock.html`، `view_admin.html`، `view_audit.html`

يمكن النسخ يدوياً إلى محرر Apps Script أو **دفع كل المجلّد بواسطة `clasp`** (انظر القسم التالي).

### الخطوة 2.3 — إعداد manifest (appsscript.json)

في محرر Apps Script، افتح `appsscript.json` (من View → Show manifest).  
في **`webapp.access`** لا تُستخدم قيم خارج [قائمة Google الرسمية](https://developers.google.com/apps-script/manifest/web-app-api-executable):  
`MYSELF`، `DOMAIN`، **`ANYONE`**، `ANYONE_ANONYMOUS`.

عند النشر يختار الواجهة غالباً «Anyone with a Google account» — في الـ manifest المكافئ هو **`ANYONE`** (وليس نصاً مثل `ANYONE_WITH_GOOGLE_ACCOUNT`؛ ذلك يُرفض من واجهة Google ومن أداة `clasp push`).

مثال يطابق مستودع `src`:
```json
{
  "timeZone": "Asia/Dubai",
  "dependencies": {},
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

أضف إلى الملف حقول **`oauthScopes`** وغيرها حسب **`src/appsscript.json`** في المستودع.

**مهم:** `executeAs` يجب أن يكون `USER_DEPLOYING` (أي: Me / المالك).

---

## النشر عبر clasp من المستودع (موصى به للصيانة)

**مشروع Apps Script («Aldhafra IMS») — معرّف السكربت الحالي:**
`1LEZ1H4GvzW7Hot5cQTbvOYYTQy1UYkPinSQbCqufJ4eBprkzqcFPCeOY`

الخطوات النموذجية (من جهاز المطور):

1. تثبيت الأداة: `npm install -g @google/clasp`
2. تسجيل الدخول: `clasp login` (بالحساب الذي يملك المشروع)
3. استنساخ المستودع:  
   `git clone https://github.com/tarekabuozaid/MEP-Store.git`  
   ثم الانتقال إلى: `cd MEP-Store/src`
4. ربط المجلّد المحلي بالمشروع القائم:  
   `clasp clone <SCRIPT_ID> --rootDir .`  
   — يُنشئ `.clasp.json`؛ **انتبه:** لو كان المشروع على السحابة فيه ملفات قليلة، قد تُجلَب إلى المحلي؛ احتفظ بنسخة Git سليمة (مثلاً `git checkout -- .` وحذف ملفات زائدة مثل `Code.js` إن ظهرت) قبل الدفع القادم.
5. رفع المصدر إلى Apps Script: `clasp push --force`

بعد ذلك، لا يزال نشر **Web App** من لوحة Apps Script (**Deploy**) مطلوباً لاختيار نسخة التشغيل وإصدار رابط **`/exec`**.

---

## المرحلة 3: نشر Web App

### الخطوة 3.1 — نشر للاختبار (Development)

1. في محرر Apps Script: `Deploy → Test deployments`
2. انسخ الـ URL الذي ينتهي بـ `/dev`
3. هذا الرابط يستخدم أحدث كود مُحفوظ — جيد للتطوير

### الخطوة 3.2 — نشر للإنتاج (Production)

1. `Deploy → New deployment`
2. النوع: `Web app`
3. الوصف: `v1.0 - Initial production deployment`
4. Execute as: `Me (owner)`
5. Who has access: `Anyone with a Google account`
6. انقر `Deploy`
7. **احفظ الـ URL** — هذا هو الرابط النهائي للمستخدمين

⚠️ كل تحديث للكود يتطلب `Deploy → Manage deployments → Edit → New version` لإنتاج URL جديد أو تحديث الحالي.

---

## المرحلة 4: الإعداد الأولي والتحقق

### الخطوة 4.1 — اختبار الوصول الأساسي

1. افتح رابط الإنتاج `/exec` في متصفح
2. يطلب منك تسجيل دخول Google (إذا لم تكن مسجلاً)
3. يجب أن ترى: Dashboard أو الواجهة الرئيسية (لأن بريدك مضاف كـ Admin)

### الخطوة 4.2 — اختبار رفض غير المسجلين

1. افتح نافذة خاصة (Incognito)
2. ادخل بحساب Gmail غير موجود في Users_Stores
3. يجب أن ترى: صفحة "غير مصرح بالدخول"

### الخطوة 4.3 — اختبار POC كامل (بحسابين)

1. أضف حساباً ثانياً في Users_Stores كـ Keeper لـ MZ
2. افتح الرابط بهذا الحساب الثاني
3. جرّب إدخال معاملة استلام
4. تحقق من Stock_Movement في Sheets

---

## المرحلة 5: إضافة المستخدمين الفعليين

### الخطوة 5.1 — إضافة أمناء المخازن

من شاشة Admin → إدارة المستخدمين، أضف كل أمين:
- بريده الإلكتروني
- كود مخزنه
- الدور: Keeper

### الخطوة 5.2 — إرسال رابط الـ Web App

أرسل الرابط لكل مستخدم. تأكد من:
- الرابط ينتهي بـ `/exec` (ليس `/dev`)
- المستخدم لديه حساب Gmail نشط

---

## المرحلة 6: المراقبة بعد الإطلاق

### Apps Script Logs
1. في محرر Apps Script: `View → Executions`
2. تظهر كل الاستدعاءات مع الوقت والنتيجة والأخطاء

### Audit_Log في Sheets
- راجع Audit_Log في Google Sheets دورياً
- ابحث عن: `UNAUTHORIZED_ACCESS` لمراقبة محاولات الاختراق

### حصص Apps Script
- `View → Executions` → يظهر الاستهلاك اليومي
- لو اقتربت من الحد: حسّن الـ batch reads/writes

---

## جدول البيانات البيئية (Environment Variables)

احتفظ بهذه المعلومات في مكان آمن:

| المتغير | القيمة | الاستخدام |
|---------|--------|---------|
| `SPREADSHEET_ID` | ID الملف من الـ URL | في Code.gs |
| `SCRIPT_ID` / `.clasp.json` | `1LEZ1H4GvzW7Hot5cQTbvOYYTQy1UYkPinSQbCqufJ4eBprkzqcFPCeOY` (مثال مشروع Aldhafra IMS) | `clasp` |
| `PROD_WEB_APP_URL` | رابط `/exec` (مثال نشر حقيقي: `https://script.google.com/macros/s/AKfycbznw4l5cq9wHJSTKtc9y8up5f28_avppDO4csc5uF1KXWBOaCefnzcueYqFvuCtCwu4/exec`) | للمستخدمين |
| `DEV_WEB_APP_URL` | رابط `/dev` | للاختبار |
| `ADMIN_EMAIL` | بريد الأدمن | للطوارئ |

---

## استكشاف الأخطاء الشائعة

| المشكلة | السبب | الحل |
|---------|-------|------|
| "Script function not found: doGet" | لم تُنشر بعد | Deploy → New deployment |
| "You do not have permission" | Spreadsheet_ID خاطئ أو الـ Script غير مرتبط | تحقق من getSpreadsheetById() |
| الـ Session.getActiveUser() فارغ | الوصول مضبوط على "Anyone (even anonymous)" | غيّر لـ "Anyone with Google account" |
| LockService timeout | طلبات كثيرة متزامنة | زد timeoutMs أو حسّن الكود |
| بيانات لا تظهر | نسخة قديمة من الـ deployment | Deploy → Manage → Edit → New version |
| `Invalid manifest … webapp.access` عند `clasp push` | قيمة `access` غير مسموحة في JSON | استخدم `ANYONE` أو إحدى القيم الرسمية فقط؛ انظر الخطوة 2.3 |
