# هندسة النظام — Aldhafra IMS v2.0

---

## 1. نظرة عامة

النظام يتكون من **طبقتين رئيسيتين**:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│              Google Apps Script Web App                      │
│         HTML + CSS + Client-side JavaScript                  │
│                                                              │
│   ┌──────────────────┐    ┌───────────────────────────┐     │
│   │   Admin Views     │    │      Keeper Views          │     │
│   │  - Dashboard      │    │  - Transaction Entry Form  │     │
│   │  - Full Ledger    │    │  - My Stock                │     │
│   │  - All Stocks     │    │  - My History              │     │
│   │  - User Mgmt      │    │                            │     │
│   │  - Reports        │    │                            │     │
│   └──────────────────┘    └───────────────────────────┘     │
│                                                              │
│              google.script.run (async bridge)                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                       │
│                   Google Apps Script                         │
│                                                              │
│  doGet(e) ──► Router ──► AuthService.checkAccess()          │
│                               │                             │
│              ┌────────────────┼────────────────┐            │
│              ▼                ▼                ▼            │
│       TransactionService  DataService    AdminService        │
│       AuthService         ReportService  LockService         │
└──────────────────────────┬──────────────────────────────────┘
                           │ SpreadsheetApp API
┌──────────────────────────▼──────────────────────────────────┐
│                      DATA LAYER                              │
│                    Google Sheets                             │
│                                                              │
│   Stock_Movement │ Master_Items │ Locations │ Users_Stores   │
│   Audit_Log      │ Counters     │                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. المكونات وأدوارها

### 2.1 Presentation Layer

| المكوّن | الوصف |
|---------|-------|
| `Index.html` | Shell الرئيسية: navigation bar + placeholder لتحميل الشاشات |
| `Dashboard.html` | Admin فقط — ملخص كل المخازن |
| `Entry.html` | Keeper — نموذج إدخال المعاملة |
| `Stock.html` | Keeper: مخزنه / Admin: كل المخازن |
| `Ledger.html` | Admin — دفتر الحركات الكامل |
| `Admin.html` | Admin — إدارة المستخدمين والمراجع |
| `styles.html` | CSS مشترك (يُضمَّن عبر `<?= include('styles') ?>`) |
| `scripts.html` | JS مشترك (form helpers, API bridge) |

### 2.2 Business Logic Layer

| الملف | الدور |
|-------|-------|
| `Code.gs` | `doGet(e)` — routing + يُرجع الـ HTML المناسب |
| `AuthService.gs` | `getUserInfo(email)` — يجلب الدور والمخزن من Users_Stores |
| `TransactionService.gs` | `submitTransaction(payload)` — المنطق الكامل المكافئ لـ VBA SubmitEntry |
| `DataService.gs` | قراءة Master_Items، Locations، Stock_Movement، Current_Stock |
| `AdminService.gs` | CRUD على Users_Stores، Master_Items، Locations |
| `ReportService.gs` | بناء Dashboard data، Ledger مع فلاتر، تصدير Excel |
| `LockService.gs` | `withLock(fn)` — wrapper يستخدم ScriptApp.getScriptLock() |
| `AuditService.gs` | `log(email, action, details)` — يكتب في Audit_Log |

### 2.3 Data Layer

| الجدول | الدور |
|--------|-------|
| `Stock_Movement` | السجل الأساسي — كل الحركات append-only |
| `Master_Items` | قائمة الأصناف المرجعية |
| `Locations` | قائمة المواقع/المخازن |
| `Users_Stores` | مصفوفة المستخدم ↔ المخزن ↔ الدور |
| `Audit_Log` | كل الأحداث: دخول، معاملات، تغييرات إدارية |
| `Counters` | سطر لكل prefix لتوليد TxnID الآمن |

---

## 3. دورة حياة الطلب (Request Lifecycle)

### 3.1 طلب GET عادي (فتح التطبيق)

```
المتصفح                Apps Script             Google Sheets
   │                       │                        │
   │─── GET /exec ────────►│                        │
   │                       │─ Session.getActiveUser()
   │                       │─ AuthService.getUserInfo(email)
   │                       │──────────────────────► Users_Stores
   │                       │◄────────────────────── {role, storeCode}
   │                       │                        │
   │                       │ [إذا غير مسجل]        │
   │◄── HTML (Error 403) ──│                        │
   │                       │                        │
   │                       │ [إذا مسجل]            │
   │◄── HTML (Shell) ──────│                        │
   │                       │                        │
```

### 3.2 حفظ معاملة (submitTransaction)

```
المتصفح                Apps Script             Google Sheets
   │                       │                        │
   │─ google.script.run ──►│                        │
   │  .submitTransaction() │                        │
   │                       │─ AuthService.checkAccess(email, storeCode)
   │                       │─ TransactionService.validate(payload)
   │                       │                        │
   │                       │ [فشل التحقق]          │
   │◄─ {success:false, ────│                        │
   │    errors:[...]}      │                        │
   │                       │                        │
   │                       │ [نجح التحقق]          │
   │                       │─ LockService.getScriptLock()
   │                       │─ TransactionService.checkBalances()
   │                       │──────────────────────► Stock_Movement (قراءة)
   │                       │◄────────────────────── current balances
   │                       │                        │
   │                       │ [رصيد كافٍ]           │
   │                       │─ TransactionService.generateTxnId()
   │                       │──────────────────────► Counters (read+update)
   │                       │─ TransactionService.writeRows()
   │                       │──────────────────────► Stock_Movement (كتابة)
   │                       │─ AuditService.log()
   │                       │──────────────────────► Audit_Log (كتابة)
   │                       │─ LockService.releaseLock()
   │                       │                        │
   │◄─ {success:true, ─────│                        │
   │    txnId: "REC-2026-0042"}                     │
```

---

## 4. نمط التزامن (Concurrency Pattern)

```javascript
// كل عملية كتابة تستخدم هذا النمط:
function withLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // انتظر 10 ثوانٍ
    return fn();
  } catch (e) {
    throw new Error('النظام مشغول، حاول مرة أخرى');
  } finally {
    lock.releaseLock();
  }
}
```

**لماذا ضروري:** Apps Script يسمح بتشغيل متعدد متزامن — بدون Lock يمكن لأميني مخزنين يرسلان في نفس اللحظة أن يحصلا على نفس TxnID أو يكتبا فوق بعض.

---

## 5. نمط التوجيه (Routing Pattern)

```javascript
// Code.gs
function doGet(e) {
  const user = AuthService.getUserInfo(Session.getActiveUser().getEmail());

  if (!user) {
    return HtmlService.createHtmlOutputFromFile('ErrorUnauthorized');
  }

  // حفظ معلومات المستخدم في Properties لاستخدامها في الشاشات
  PropertiesService.getScriptProperties().setProperty('currentUser', JSON.stringify(user));

  const template = HtmlService.createTemplateFromFile('Index');
  template.user = user;
  return template.evaluate()
    .setTitle('Aldhafra IMS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

---

## 6. نمط include للملفات

```html
<!-- في Index.html -->
<?!= include('styles') ?>
<?!= include('scripts') ?>
```

```javascript
// في Code.gs
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

هذا النمط الرسمي من Google للفصل بين CSS/JS/HTML مع الحفاظ على ملف واحد للنشر.

---

## 7. القيود التقنية لـ Apps Script

| القيد | القيمة | الأثر |
|-------|--------|-------|
| مدة تنفيذ script واحد | 6 دقائق | لا تأثير لمعاملة عادية |
| حصة الكتابة اليومية | 20,000 عملية كتابة خلايا | ~2000 معاملة/يوم (كل معاملة 10 خلايا تقريباً) |
| طلبات SpreadsheetApp | غير محدودة في حدود الوقت | استخدم `getValues()` بدل قراءة خلية بخلية |
| مستخدمون متزامنون | غير محدود تقنياً | LockService يتعامل مع التعارض |
| حجم Web App | لا حد عملي للـ HTML | الصور الكبيرة تُحمَّل من خارج Script |

---

## 8. أدوات المطوّر

| الأداة | الاستخدام |
|--------|---------|
| `clasp` CLI | رفع ملفات .gs/.html إلى Apps Script من local |
| Apps Script Editor | تحرير مباشر ومراقبة Logs |
| `Logger.log()` + Stackdriver | تتبع الأخطاء |
| `/dev` URL | اختبار النسخة الأحدث بدون نشر جديد |
| `/exec` URL | النسخة الإنتاجية المثبتة |
