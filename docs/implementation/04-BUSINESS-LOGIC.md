# منطق الأعمال — Aldhafra IMS v2.0
## قواعد التحقق والمعاملات (منقول من VBA مع إصلاحات)

---

## 1. تدفق submitTransaction (الدالة الرئيسية)

```
submitTransaction(payload)
        │
        ▼
1. التحقق من الهوية
   AuthService.checkAccess(email, payload.location)
   [فشل] ─► throw Error('غير مصرح')
        │
        ▼
2. التحقق من الحقول الإلزامية
   validateHeader(payload)
   [فشل] ─► return {success:false, errors:[...]}
        │
        ▼
3. التحقق من الأصناف
   validateLines(payload.lines)
   [فشل] ─► return {success:false, errors:[...]}
        │
        ▼
4. فحص الرصيد (للصرف والتحويل فقط)
   checkBalances(lines, location)
   [رصيد غير كافٍ] ─► return {success:false, errors:[...]}
        │
        ▼
5. داخل LockService.withLock():
   a. توليد TxnID
   b. كتابة الصفوف
   c. تسجيل Audit
        │
        ▼
6. return {success:true, txnId, rowsWritten}
```

---

## 2. التحقق من الهيدر (validateHeader)

| الحقل | القاعدة | نوع الخطأ |
|-------|---------|----------|
| `TxnType` | يجب أن يكون: `Receipt` \| `Issuance` \| `Adjustment` \| `Transfer` | مانع |
| `Date` | مطلوب + تاريخ صالح | مانع |
| `Date` | أبعد من 30 يوماً من اليوم | تحذير فقط (غير مانع) |
| `SourceLocation` | مطلوب + موجود في Locations + IsActive=TRUE | مانع |
| `DestLocation` | مطلوب **فقط للتحويل** + موجود + ≠ SourceLocation | مانع |
| عدد الأسطر | صنف واحد على الأقل بكمية صحيحة | مانع |

---

## 3. التحقق من الأصناف (validateLines)

لكل سطر في payload.lines:

| الحقل | القاعدة | الإجراء |
|-------|---------|---------|
| `ItemCode` | فارغ أو "0" | تجاهل الصف هادئاً (لا خطأ) |
| `ItemCode` | غير موجود في Master_Items أو IsActive=FALSE | خطأ مانع لهذا الصف |
| `Qty` | غير رقمي | خطأ مانع |
| `Qty` | ≤ 0 | خطأ مانع |
| `Qty` | للـ Adjustment: يمكن أن يكون سالباً | **الاستثناء الوحيد** — مسموح |

**نتيجة validateLines:** قائمة أسطر صالحة + قائمة أخطاء لكل سطر مرفوض.

---

## 4. حماية المخزون (checkBalances)

تُطبَّق **فقط على:**
- `Issuance`
- `Transfer` (جانب المصدر)

**لا تُطبَّق على:** `Receipt`، `Adjustment` (مع تحذير للـ Adjustment السالب)

```
لكل صنف في الأسطر الصالحة:
  currentBalance = getBalance(itemCode, sourceLocation)
  
  إذا qty > currentBalance:
    أضف خطأ مانع: "رصيد غير كافٍ — متاح: {currentBalance}, مطلوب: {qty}"
  
  إذا qty > 0 AND currentBalance - qty < minStock:
    أضف تحذير غير مانع: "تحت الحد الأدنى بعد الصرف"
```

**دالة getBalance:**
```javascript
function getBalance(itemCode, location) {
  // قراءة Stock_Movement كاملة مرة واحدة (batch read)
  const data = getStockMovementData(); // getValues() مرة واحدة
  
  return data.reduce((bal, row) => {
    if (row.ItemCode !== itemCode || row.Location !== location) return bal;
    if (row.TxnType === 'Receipt') return bal + row.Qty;
    if (row.TxnType === 'Issuance') return bal - row.Qty;
    if (row.TxnType === 'Adjustment') return bal + row.Qty; // Qty قد يكون سالباً
    return bal;
  }, 0);
}
```

**ملاحظة تحسين الأداء:** نقرأ Stock_Movement مرة واحدة (`getValues()`) وليس سطراً بسطر — هذا يحل مشكلة O(n²) في VBA القديم.

---

## 5. توليد TxnID (generateTxnId)

```javascript
function generateTxnId(txnType) {
  const prefixMap = {
    'Receipt':    'REC',
    'Issuance':   'ISS',
    'Adjustment': 'ADJ',
    'Transfer':   'TRF'
  };
  
  const prefix = prefixMap[txnType];
  const year = new Date().getFullYear();
  
  // داخل LockService.withLock():
  const countersSheet = getSheet('Counters');
  const data = countersSheet.getDataRange().getValues();
  
  const rowIndex = data.findIndex(r => r[0] === prefix);
  const lastSeq = (data[rowIndex][1] === year) 
    ? data[rowIndex][2] 
    : 0; // إعادة التسلسل عند بداية سنة جديدة
  
  const newSeq = lastSeq + 1;
  
  // تحديث الـ Counter
  countersSheet.getRange(rowIndex + 1, 2, 1, 2).setValues([[year, newSeq]]);
  
  return `${prefix}-${year}-${String(newSeq).padStart(4, '0')}`;
}
```

**النتيجة:** `REC-2026-0043`

---

## 6. نمط التحويل (Transfer Double-Row)

التحويل يكتب **صفين في Stock_Movement** من نفس المعاملة:

| الحقل | صف 1 (OUT) | صف 2 (IN) |
|-------|-----------|----------|
| `TxnID` | `TRF-2026-0023-OUT` | `TRF-2026-0023-IN` |
| `TxnType` | `Transfer` | `Transfer` |
| `Location` | موقع المصدر | موقع الوجهة |
| `Qty` | الكمية (موجبة) | الكمية (موجبة) |
| كل الحقول الأخرى | نفسها | نفسها |

**عند حساب الرصيد:**
- الصف OUT في Location المصدر يُعامَل كـ Issuance (يطرح من الرصيد)
- الصف IN في Location الوجهة يُعامَل كـ Receipt (يضيف للرصيد)

```javascript
// في دالة getBalance() — للتحويل:
if (row.TxnType === 'Transfer') {
  if (row.TxnID.endsWith('-OUT') && row.Location === location) return bal - row.Qty;
  if (row.TxnID.endsWith('-IN')  && row.Location === location) return bal + row.Qty;
}
```

---

## 7. كتابة الصفوف (writeRows)

```javascript
function writeRows(txnId, header, validLines) {
  const sheet = getSheet('Stock_Movement');
  const timestamp = new Date();
  const userEmail = Session.getActiveUser().getEmail();
  
  const rows = [];
  
  for (const line of validLines) {
    const baseRow = [
      txnId,              // A: TxnID
      header.date,        // B: Date
      header.txnType,     // C: TxnType
      line.itemCode,      // D: ItemCode
      line.itemName,      // E: ItemName
      line.unit,          // F: Unit
      line.qty,           // G: Qty
      header.sourceLocation, // H: Location
      header.lpo || '',   // I: LPO
      header.supplier || '', // J: Supplier
      header.requester || '', // K: Requester
      header.receiver || '', // L: Receiver
      header.notes || '',  // M: Notes
      userEmail,          // N: UserEmail
      timestamp           // O: Timestamp
    ];
    
    if (header.txnType === 'Transfer') {
      // صف OUT
      rows.push([...baseRow].map((v, i) => i === 0 ? txnId + '-OUT' : v));
      // صف IN
      const inRow = [...baseRow];
      inRow[0] = txnId + '-IN';
      inRow[7] = header.destLocation; // تغيير Location للوجهة
      rows.push(inRow);
    } else {
      rows.push(baseRow);
    }
  }
  
  // كتابة دفعية واحدة (batch write) — أسرع بكثير من صف بصف
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
}
```

---

## 8. قواعد الـ Adjustment

- الكمية **يمكن أن تكون سالبة** (الاستثناء الوحيد على قاعدة "موجبة دائماً")
- لا فحص للرصيد (لأن الجرد قد يُصحِّح أخطاء قديمة)
- إذا كان الرصيد الناتج سيصبح سالباً: **تحذير غير مانع** يظهر للمستخدم
- يجب تأكيد صريح قبل المتابعة لو الرصيد سيصبح سالباً

---

## 9. سيناريوهات الخطأ وردود الفعل

| الخطأ | الرسالة للمستخدم | مانع؟ |
|-------|-----------------|-------|
| نوع معاملة غير صالح | "نوع المعاملة غير معروف" | ✅ |
| تاريخ فارغ | "الرجاء إدخال التاريخ" | ✅ |
| تاريخ أبعد من 30 يوم | "تنبيه: التاريخ أبعد من 30 يوماً، هل تريد المتابعة؟" | ❌ تحذير |
| موقع غير موجود | "الموقع '{code}' غير موجود في القائمة" | ✅ |
| مصدر = وجهة (تحويل) | "موقع المصدر والوجهة لا يمكن أن يكونا نفس الموقع" | ✅ |
| كمية غير رقمية | "الكمية في الصف {n} يجب أن تكون رقماً" | ✅ |
| كمية صفر أو سالبة (غير Adjustment) | "الكمية في الصف {n} يجب أن تكون أكبر من صفر" | ✅ |
| رصيد غير كافٍ | "رصيد {itemName} في {location} = {available}، مطلوب: {requested}" | ✅ |
| Adjustment يُعطي رصيداً سالباً | "تحذير: الرصيد سيصبح {result}، هل تريد المتابعة؟" | ❌ تحذير |
| Lock timeout | "النظام مشغول حالياً، حاول بعد لحظة" | ✅ |
| غير مصرح للموقع | "غير مصرح لك بالوصول لموقع {location}" | ✅ |

---

## 10. الفرق عن VBA القديم (الإصلاحات المطبقة)

| المشكلة في VBA | الحل في الإصدار الجديد |
|---------------|----------------------|
| O(n²): GetCurrentBalance في حلقة | قراءة Stock_Movement مرة واحدة (batch) + reduce |
| TxnID هش (يمسح العمود) | جدول Counters مستقل مع LockService |
| لا عزل رصيد بالموقع | `Location` في كل SUMIF + في getBalance |
| لا حماية تزامن | `LockService.withLock()` على كل كتابة |
| Adjustment بلا رقابة | تحذير واضح لو النتيجة سالبة |
| لا Audit trail | كل معاملة تُسجَّل في Audit_Log مع UserEmail |
