# المصادقة والصلاحيات — Aldhafra IMS v2.0

---

## 1. مبدأ التصميم

```
المستخدمون لا يملكون أي وصول مباشر لـ Google Sheets.
كل وصول يمر عبر Apps Script Web App.
كل طلب يُتحقَّق منه مقابل Users_Stores.
```

---

## 2. تدفق المصادقة

```
المستخدم يفتح رابط Web App
        │
        ▼
Google OAuth (تلقائي)
        │
        ▼
Session.getActiveUser().getEmail()
        │
        ├── فارغ / غير مصادق ──► رسالة خطأ (نادر مع إعداد 'Anyone with Google account')
        │
        ▼
AuthService.getUserInfo(email)
        │
        ├── غير موجود في Users_Stores ──► ErrorUnauthorized.html
        ├── IsActive = FALSE ──► ErrorDeactivated.html
        │
        ▼
تحميل Shell المناسب (Admin أو Keeper أو Viewer)
```

---

## 3. إعداد Web App

| الإعداد | القيمة (v2.0+) | السبب |
|---------|--------|-------|
| Execute the app as | **USER_ACCESSING** | في appsscript.json — يسمح بتسجيل بريد المستخدم الحالي بدقة في Audit_Log وجميع السجلات. بدلاً من `USER_DEPLOYING` في الإصدارات السابقة |
| Who has access | **Anyone with a Google account** | يجبر على تسجيل دخول Google؛ `Session.getActiveUser()` يُعطي الإيميل |

⚠️ **لا تستخدم "Anyone (even anonymous)"** — لن يكون `Session.getActiveUser()` متاحاً.

**ملاحظة:** تم تغيير `executeAs` إلى `USER_ACCESSING` في v2.0 للحصول على بيانات المستخدم الفعلي بدقة أكبر في التدقيق.

**OAuth Scopes (v2.0+):**
- `https://www.googleapis.com/auth/spreadsheets` — قراءة/كتابة البيانات
- `https://www.googleapis.com/auth/drive.readonly` — قراءة معلومات الملف (للمستقبل)

---

## 4. جدول Users_Stores بالتفصيل

```
Email           │ StoreCode │ Role   │ FullName    │ IsActive │ AddedDate
────────────────┼───────────┼────────┼─────────────┼──────────┼──────────
admin@gmail.com │ *         │ Admin  │ مدير النظام │ TRUE     │ 01/01/2026
keeper1@gmail.com│ MZ        │ Keeper │ أحمد علي   │ TRUE     │ 15/01/2026
keeper2@gmail.com│ L         │ Keeper │ محمد سالم  │ TRUE     │ 15/01/2026
viewer@gmail.com │ *         │ Viewer │ مراقب       │ TRUE     │ 01/02/2026
old@gmail.com   │ MZ        │ Keeper │ موظف قديم  │ FALSE    │ 01/12/2025
```

### قواعد StoreCode

| الدور | StoreCode المناسب | المعنى |
|-------|------------------|--------|
| Admin | `*` | وصول لكل المخازن |
| Keeper | كود محدد مثل `MZ` | مخزن واحد فقط |
| Viewer | `*` أو كود محدد | قراءة كل المخازن أو مخزن |

---

## 5. مصفوفة الصلاحيات

| الإجراء | Admin | Keeper (مخزنه) | Keeper (مخزن آخر) | Viewer |
|---------|-------|---------------|-------------------|--------|
| إدخال معاملة | ✅ | ✅ | ❌ | ❌ |
| عرض مخزونه | ✅ | ✅ | ❌ | ✅ (قراءة) |
| عرض مخزون كل المخازن | ✅ | ❌ | ❌ | ✅ (لو *) |
| عرض حركاته | ✅ | ✅ | ❌ | ✅ |
| عرض كل الحركات | ✅ | ❌ | ❌ | ✅ (لو *) |
| Dashboard | ✅ | ❌ | ❌ | ✅ |
| إضافة مستخدم | ✅ | ❌ | ❌ | ❌ |
| تعديل مستخدم | ✅ | ❌ | ❌ | ❌ |
| إضافة صنف | ✅ | ❌ | ❌ | ❌ |
| إضافة موقع | ✅ | ❌ | ❌ | ❌ |
| تصدير Excel | ✅ | ❌ | ❌ | ❌ |
| عرض Audit Log | ✅ | ❌ | ❌ | ❌ |

---

## 6. فحص الصلاحيات في كل دالة

```javascript
// مثال في TransactionService.submitTransaction()
function submitTransaction(payload) {
  const email = Session.getActiveUser().getEmail();
  const user = AuthService.getUserInfo(email);

  // فحص 1: هل المستخدم مسجل؟
  if (!user) throw new Error('UNAUTHORIZED');

  // فحص 2: هل المستخدم مصرح له بهذا الموقع؟
  if (user.role === 'Keeper' && user.storeCode !== payload.sourceLocation) {
    throw new Error('ACCESS_DENIED: موقع غير مصرح به');
  }

  // فحص 3: هل الدور يسمح بالكتابة؟
  if (user.role === 'Viewer') {
    throw new Error('ACCESS_DENIED: صلاحيات القراءة فقط');
  }

  // ... بقية المنطق
}
```

---

## 7. عدم كشف OAuth Token

```javascript
// ❌ خطأ — يُعرض الـ token للـ client
function doGet(e) {
  const token = ScriptApp.getOAuthToken();
  return HtmlService.createHtmlOutput(`<script>var token='${token}'</script>`);
}

// ✅ صح — التحقق يبقى على الـ server فقط
function doGet(e) {
  const user = AuthService.getCurrentUser();
  if (!user) return HtmlService.createHtmlOutputFromFile('ErrorUnauthorized');
  // لا tokens تُمرَّر للـ client
  const template = HtmlService.createTemplateFromFile('Index');
  template.userName = user.fullName;
  template.userRole = user.role;
  return template.evaluate();
}
```

---

## 8. سيناريوهات التخويل وردود الفعل

| السيناريو | الرد |
|-----------|------|
| بريد غير موجود في Users_Stores | صفحة رفض: "غير مسجل في النظام" |
| IsActive = FALSE | صفحة رفض: "الحساب معطَّل، تواصل مع الأدمن" |
| Keeper يحاول الوصول لموقع غير مخزنه | خطأ 403 + تسجيل في Audit_Log |
| Viewer يحاول إدخال معاملة | إخفاء الزر من الواجهة + رفض من الـ server |
| Admin يفعل أي شيء | مسموح دائماً |

---

## 9. إدارة المستخدمين (بروتوكول)

### إضافة مستخدم جديد:
1. الأدمن يفتح شاشة إدارة المستخدمين
2. ينقر "+ إضافة مستخدم"
3. يُدخل: Gmail + المخزن + الدور + الاسم
4. النظام يتحقق: البريد غير موجود مسبقاً + المخزن موجود
5. يُحفظ في Users_Stores + يُسجَّل في Audit_Log
6. **المستخدم لا يحتاج أي خطوة إضافية** — بمجرد إضافة بريده يُقبل في المرة القادمة

### تعطيل مستخدم:
1. الأدمن ينقر 🚫 بجانب المستخدم
2. IsActive تُصبح FALSE
3. المستخدم يُرفض فوراً في المرة القادمة
4. **لا حذف من الجدول** — للحفاظ على المراجع التاريخية

### تغيير المخزن أو الدور:
1. الأدمن ينقر ✏️
2. يعدل المخزن أو الدور
3. يُحفظ + يُسجَّل
4. يسري التغيير فوراً

---

## 10. اعتبارات الأمان

| الاعتبار | الإجراء |
|---------|---------|
| لا Edit access على Sheets للمستخدمين | الملف مشترك "view only" أو "restricted" — Apps Script تكتب بصلاحيات المالك |
| تتبع كل الأحداث | Audit_Log يسجل كل login + كل محاولة رفض |
| الرابط غير السري | الرابط `/exec` عام لكن بلا بريد مسجل لا يفيد |
| تغيير دور الأدمن | الأدمن لا يستطيع تعطيل نفسه (حماية من القفل العرضي) |
