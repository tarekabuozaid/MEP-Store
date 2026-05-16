# مواصفات الدوال — Aldhafra IMS v2.0
## كل دالة Apps Script بتفاصيلها الكاملة

---

## هيكل الملفات

```
Code.gs               ← doGet، routing، include
AuthService.gs        ← كل شيء يخص المصادقة والتخويل
TransactionService.gs ← منطق المعاملات الكامل
DataService.gs        ← قراءة البيانات المرجعية
AdminService.gs       ← CRUD على المراجع والمستخدمين
ReportService.gs      ← Dashboard، تصدير، Audit
LockService.gs        ← wrapper للـ ScriptLock
AuditService.gs       ← كتابة Audit_Log
```

---

## Code.gs

### `doGet(e)`
```
الغرض:      نقطة الدخول الوحيدة للـ Web App
المدخلات:   e — event object من Google (e.queryString، e.parameter)
المخرجات:   HtmlOutput — Shell أو صفحة خطأ
الآثار:     يقرأ Users_Stores للتحقق من المستخدم
الأخطاء:    مستخدم غير مسجل → ErrorUnauthorized.html
```

### `include(filename)`
```
الغرض:      تضمين ملفات HTML/CSS/JS في Template
المدخلات:   filename: String — اسم الملف بدون امتداد
المخرجات:   String — محتوى الملف
الآثار:     لا شيء (قراءة فقط)
```

---

## AuthService.gs

### `getUserInfo(email)`
```
الغرض:      جلب بيانات المستخدم من Users_Stores
المدخلات:   email: String — Gmail الكامل
المخرجات:   Object | null
            {
              email: String,
              storeCode: String,   // '*' للأدمن
              role: String,        // 'Admin' | 'Keeper' | 'Viewer'
              fullName: String,
              isActive: Boolean
            }
            أو null لو غير موجود أو isActive=false
الآثار:     قراءة Users_Stores
الأخطاء:    null → doGet يعرض صفحة خطأ
```

### `checkAccess(email, requiredStoreCode, requiredRole)`
```
الغرض:      يتحقق هل المستخدم مصرح له بعملية معينة
المدخلات:   email: String
            requiredStoreCode: String | null  // null = أي موقع
            requiredRole: String | null        // null = أي دور
المخرجات:   Boolean
المنطق:
            Admin → دائماً true
            Keeper → true لو storeCode يطابق أو requiredStoreCode = null
            Viewer → true للقراءة فقط
الآثار:     يستدعي getUserInfo()
```

### `getCurrentUser()`
```
الغرض:      يجلب بيانات المستخدم الحالي من الـ Session
المخرجات:   Object نفس getUserInfo()
الملاحظة:   مختصر لـ getUserInfo(Session.getActiveUser().getEmail())
```

---

## TransactionService.gs

### `submitTransaction(payload)`
```
الغرض:      حفظ معاملة كاملة — الدالة الرئيسية
المدخلات:   payload: Object
            {
              txnType: String,
              date: String,
              sourceLocation: String,
              destLocation: String | null,
              lpo: String,
              supplier: String,
              requester: String,
              receiver: String,
              notes: String,
              lines: Array<{
                itemCode: String,
                itemName: String,
                unit: String,
                qty: Number
              }>
            }
المخرجات:   Object
            {
              success: Boolean,
              txnId: String | null,
              rowsWritten: Number,
              errors: Array<{row: Number, message: String}>,
              warnings: Array<String>
            }
الآثار:     كتابة Stock_Movement، Counters، Audit_Log
الأخطاء:    كل أخطاء التحقق تُعاد في errors[] بدل throw
الملاحظة:   يستدعي withLock() قبل أي كتابة
```

### `validateHeader(payload)`
```
الغرض:      التحقق من حقول الهيدر
المدخلات:   payload: Object (نفس أعلاه)
المخرجات:   Object
            {
              isValid: Boolean,
              errors: Array<String>,
              warnings: Array<String>
            }
الآثار:     قراءة Locations
```

### `validateLines(lines, txnType)`
```
الغرض:      التحقق من صحة كل سطر أصناف
المدخلات:   lines: Array، txnType: String
المخرجات:   Object
            {
              validLines: Array,
              errors: Array<{row: Number, message: String}>
            }
الآثار:     قراءة Master_Items
```

### `checkBalances(validLines, sourceLocation, txnType)`
```
الغرض:      فحص كفاية الرصيد لأصناف الصرف والتحويل
المدخلات:   validLines: Array، sourceLocation: String، txnType: String
المخرجات:   Object
            {
              passed: Boolean,
              errors: Array<{itemCode, available, requested}>,
              warnings: Array<{itemCode, resultBalance, minStock}>
            }
الآثار:     قراءة Stock_Movement (مرة واحدة batch)
```

### `generateTxnId(txnType)`
```
الغرض:      توليد TxnID فريد ومتسلسل
المدخلات:   txnType: String
المخرجات:   String — مثال: 'REC-2026-0043'
الآثار:     قراءة وتحديث Counters
الملاحظة:   يجب استدعاؤه داخل withLock()
```

### `writeRows(txnId, header, validLines)`
```
الغرض:      كتابة الصفوف في Stock_Movement
المدخلات:   txnId: String، header: Object، validLines: Array
المخرجات:   Number — عدد الصفوف المكتوبة
الآثار:     كتابة دفعية (batch) في Stock_Movement
الملاحظة:   للتحويل يكتب صفين (OUT + IN) لكل صنف
```

---

## DataService.gs

### `getMasterItems(activeOnly = true)`
```
الغرض:      جلب قائمة الأصناف للـ autocomplete والتحقق
المدخلات:   activeOnly: Boolean — لو true يُرجع الأصناف النشطة فقط
المخرجات:   Array<{itemCode, itemName, unit, minStock, isActive}>
الآثار:     قراءة Master_Items
الاستخدام:  عند تحميل نموذج الإدخال
```

### `getLocations(activeOnly = true)`
```
الغرض:      جلب قائمة المواقع
المخرجات:   Array<{storeCode, storeName, isActive}>
الآثار:     قراءة Locations
```

### `getBalance(itemCode, location)`
```
الغرض:      حساب الرصيد الحالي لصنف في موقع
المدخلات:   itemCode: String، location: String
المخرجات:   Number
الآثار:     قراءة Stock_Movement (batch)
الملاحظة:   يستدعي getStockMovementData() الذي يُخزّن نتيجة getValues() مؤقتاً في نفس الاستدعاء
```

### `getStockByLocation(location)`
```
الغرض:      جلب الرصيد الكامل لموقع معين
المدخلات:   location: String | '*' لكل المواقع
المخرجات:   Array<{itemCode, itemName, unit, balance, minStock, status}>
            status: 'OK' | 'LOW' | 'ZERO'
الآثار:     قراءة Stock_Movement + Master_Items
الاستخدام:  شاشة Stock للأمين
```

### `getTransactions(filters)`
```
الغرض:      جلب الحركات مع فلاتر
المدخلات:   filters: Object
            {
              location: String | null,     // null = كل المواقع
              txnType: String | null,
              itemCode: String | null,
              dateFrom: Date | null,
              dateTo: Date | null,
              limit: Number                // default: 500
            }
المخرجات:   Array<Object> — صفوف Stock_Movement المفلترة
الآثار:     قراءة Stock_Movement
```

### `getItemDetails(itemCode)`
```
الغرض:      جلب تفاصيل صنف بكوده
المدخلات:   itemCode: String
المخرجات:   Object | null — {itemCode, itemName, unit, minStock}
الآثار:     قراءة Master_Items
الاستخدام:  لملء حقول النموذج عند إدخال الكود
```

---

## AdminService.gs

### `getUsers()`
```
الغرض:      جلب كل المستخدمين من Users_Stores
المخرجات:   Array<{email, storeCode, role, fullName, isActive, addedDate}>
الصلاحية:   Admin فقط
```

### `addUser(userData)`
```
الغرض:      إضافة مستخدم جديد
المدخلات:   userData: {email, storeCode, role, fullName}
المخرجات:   {success: Boolean, message: String}
الصلاحية:   Admin فقط
الآثار:     كتابة Users_Stores + Audit_Log
الأخطاء:    البريد موجود مسبقاً → error
```

### `updateUser(email, updates)`
```
الغرض:      تعديل بيانات مستخدم
المدخلات:   email: String، updates: {role?, storeCode?, fullName?, isActive?}
المخرجات:   {success: Boolean}
الصلاحية:   Admin فقط
الآثار:     تحديث Users_Stores + Audit_Log
```

### `deactivateUser(email)`
```
الغرض:      تعطيل وصول مستخدم (IsActive = FALSE)
المدخلات:   email: String
المخرجات:   {success: Boolean}
الصلاحية:   Admin فقط
الآثار:     تحديث Users_Stores + Audit_Log
الملاحظة:   لا حذف — فقط تعطيل للحفاظ على المراجع
```

### `addItem(itemData)`
```
الغرض:      إضافة صنف جديد لـ Master_Items
المدخلات:   itemData: {itemCode, itemName, unit, minStock, category?}
المخرجات:   {success: Boolean, message: String}
الصلاحية:   Admin فقط
الآثار:     كتابة Master_Items + Audit_Log
```

### `addLocation(locationData)`
```
الغرض:      إضافة موقع جديد لـ Locations
المدخلات:   locationData: {storeCode, storeName}
المخرجات:   {success: Boolean}
الصلاحية:   Admin فقط
```

---

## ReportService.gs

### `getDashboardData()`
```
الغرض:      بيانات لوحة تحكم الأدمن
المخرجات:   Object
            {
              todayTransactions: Number,
              todayByType: {Receipt, Issuance, Adjustment, Transfer},
              lowStockItems: Array<{itemCode, itemName, location, balance, minStock}>,
              recentTransactions: Array (آخر 10),
              totalItemsByLocation: Array<{location, itemCount}>
            }
الصلاحية:   Admin فقط
```

### `getLedger(filters)`
```
الغرض:      دفتر الحركات الكامل مع فلاتر
المدخلات:   نفس getTransactions() filters
المخرجات:   Array من الحركات
الصلاحية:   Admin — كل المواقع؛ Keeper — مخزنه فقط
```

### `exportToExcel(filters)`
```
الغرض:      تصدير الحركات كملف Excel
المدخلات:   filters: Object (نفس getLedger)
المخرجات:   String — base64 blob للـ xlsx
الصلاحية:   Admin فقط
الملاحظة:   يستخدم SpreadsheetApp.create() مؤقتاً ثم يُصدَّر
```

### `getAuditLog(filters)`
```
الغرض:      جلب سجل المراجعة
المدخلات:   filters: {dateFrom, dateTo, userEmail?, action?, limit}
المخرجات:   Array<Object>
الصلاحية:   Admin فقط
```

---

## LockService.gs

### `withLock(fn, timeoutMs = 10000)`
```
الغرض:      تنفيذ دالة بأمان داخل ScriptLock لمنع التزامن
المدخلات:   fn: Function — الدالة المراد حمايتها
            timeoutMs: Number — وقت الانتظار الأقصى
المخرجات:   نتيجة fn()
الأخطاء:    timeout → throw Error('النظام مشغول، حاول مرة أخرى')
الاستخدام:
            return withLock(() => {
              const id = generateTxnId(txnType);
              writeRows(id, header, lines);
              return id;
            });
```

---

## AuditService.gs

### `log(action, entity, entityId, details)`
```
الغرض:      تسجيل حدث في Audit_Log
المدخلات:   action: String — من قائمة الأحداث المعرّفة
            entity: String — الكيان المتأثر
            entityId: String — معرّف الكيان
            details: Object — تفاصيل إضافية (يُحوَّل لـ JSON)
المخرجات:   void
الآثار:     كتابة صف في Audit_Log
الملاحظة:   يجلب UserEmail من Session تلقائياً
            لا يرمي exception لو فشل (لا تكسر المعاملة بسبب الـ audit)
```

---

## أنماط عامة (قواعد لكل الدوال)

### قاعدة 1: Batch Reads
```javascript
// ✅ صح — قراءة مرة واحدة
const allData = sheet.getDataRange().getValues();
const item = allData.find(r => r[0] === itemCode);

// ❌ خطأ — قراءة خلية بخلية
for (let i = 1; i <= sheet.getLastRow(); i++) {
  if (sheet.getRange(i, 1).getValue() === itemCode) { ... }
}
```

### قاعدة 2: Batch Writes
```javascript
// ✅ صح — كتابة دفعية
sheet.getRange(startRow, 1, rows.length, cols).setValues(rows);

// ❌ خطأ — كتابة صف بصف
rows.forEach((row, i) => sheet.getRange(startRow + i, 1, 1, cols).setValues([row]));
```

### قاعدة 3: تمرير الأخطاء
```javascript
// الدوال تُرجع {success, errors} ولا ترمي exceptions للأخطاء المتوقعة
// تُرمى exceptions فقط للأخطاء غير المتوقعة (network، permissions)
```
