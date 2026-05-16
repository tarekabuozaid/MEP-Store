# نموذج البيانات — Aldhafra IMS v2.0
## مخطط Google Sheets الكامل

---

## 1. نظرة عامة على الجداول

```
┌─────────────────┐     ┌─────────────────┐
│  Master_Items   │     │    Locations    │
│  ItemCode (PK)  │     │  StoreCode (PK) │
│  ItemName       │     │  StoreName      │
│  Unit           │     │  IsActive       │
│  MinStock       │     └────────┬────────┘
└────────┬────────┘              │
         │                       │
         │ ItemCode              │ Location
         ▼                       ▼
┌─────────────────────────────────────────┐
│             Stock_Movement              │
│  TxnID (PK)  │  Date     │  TxnType    │
│  ItemCode    │  ItemName │  Unit        │
│  Qty         │  Location │  LPO         │
│  Supplier    │  Requester│  Receiver    │
│  Notes       │  UserEmail│  Timestamp   │
└─────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐
│  Users_Stores   │     │   Counters      │
│  Email (PK)     │     │  Prefix (PK)    │
│  StoreCode      │     │  LastSeq        │
│  Role           │     │  Year           │
│  IsActive       │     └─────────────────┘
└─────────────────┘

┌─────────────────────────────────────────┐
│               Audit_Log                 │
│  LogID  │  Timestamp  │  UserEmail      │
│  Action │  Entity     │  EntityID        │
│  Details│                               │
└─────────────────────────────────────────┘
```

---

## 2. جدول Stock_Movement

**الدور:** السجل المحوري لكل الحركات — append-only، لا حذف ولا تعديل أبداً.

| العمود | النوع | مطلوب | القيم المسموحة / الوصف |
|--------|-------|--------|----------------------|
| A: `TxnID` | String | ✅ | تنسيق: `{PREFIX}-{YYYY}-{NNNN}` مثال: `REC-2026-0042`، للتحويل: `-OUT` أو `-IN` بعد الرقم |
| B: `Date` | Date | ✅ | تاريخ المعاملة (dd/mm/yyyy) |
| C: `TxnType` | String | ✅ | `Receipt` \| `Issuance` \| `Adjustment` \| `Transfer` |
| D: `ItemCode` | String | ✅ | كود الصنف من Master_Items |
| E: `ItemName` | String | ✅ | اسم الصنف (مُدخَل وقت الحفظ، لا يتغير لو تغير الاسم لاحقاً) |
| F: `Unit` | String | ✅ | وحدة القياس (مُدخَلة وقت الحفظ) |
| G: `Qty` | Number | ✅ | كمية موجبة دائماً؛ للتحويل: OUT = الخروج، IN = الدخول |
| H: `Location` | String | ✅ | كود الموقع من Locations — **إلزامي لعزل الرصيد** |
| I: `LPO` | String | ❌ | رقم أمر الشراء (للاستلام غالباً) |
| J: `Supplier` | String | ❌ | اسم المورد |
| K: `Requester` | String | ❌ | اسم الطالب (للصرف) |
| L: `Receiver` | String | ❌ | اسم المستلم |
| M: `Notes` | String | ❌ | ملاحظات إضافية |
| N: `UserEmail` | String | ✅ | Gmail المستخدم الذي أدخل المعاملة (من Session) |
| O: `Timestamp` | DateTime | ✅ | وقت الحفظ الفعلي في النظام (تلقائي) |

**الصف الأول:** عناوين الأعمدة
**بيانات تبدأ من:** الصف 2

**ملاحظات مهمة:**
- `Qty` دائماً موجبة؛ نوع المعاملة هو ما يحدد الاتجاه
- `Adjustment` الكمية الموجبة تضيف، السالبة تطرح (الاستثناء الوحيد للرقم السالب)
- لا تُعدَّل هذه البيانات بعد الإدخال — أي تصحيح يكون بمعاملة جديدة

---

## 3. جدول Master_Items

**الدور:** قائمة الأصناف المرجعية.

| العمود | النوع | مطلوب | الوصف |
|--------|-------|--------|-------|
| A: `ItemCode` | String | ✅ | كود فريد للصنف (PK) — لا يتغير بعد الإنشاء |
| B: `ItemName` | String | ✅ | الاسم الكامل للصنف |
| C: `Unit` | String | ✅ | وحدة القياس: قطعة، كيلو، لتر، علبة... |
| D: `MinStock` | Number | ✅ | الحد الأدنى للتنبيه (0 لو غير مطلوب) |
| E: `Category` | String | ❌ | تصنيف اختياري |
| F: `IsActive` | Boolean | ✅ | `TRUE` \| `FALSE` — الأصناف غير النشطة لا تظهر في نموذج الإدخال |

**الصف الأول:** عناوين
**بيانات تبدأ من:** الصف 2

---

## 4. جدول Locations

**الدور:** قائمة المخازن والمواقع.

| العمود | النوع | مطلوب | الوصف |
|--------|-------|--------|-------|
| A: `StoreCode` | String | ✅ | كود فريد للموقع (PK) — مثال: `MZ`, `L`, `AD` |
| B: `StoreName` | String | ✅ | الاسم الكامل للموقع |
| C: `IsActive` | Boolean | ✅ | `TRUE` \| `FALSE` |

---

## 5. جدول Users_Stores

**الدور:** مصفوفة المستخدمين — يديرها الأدمن يدوياً.

| العمود | النوع | مطلوب | الوصف |
|--------|-------|--------|-------|
| A: `Email` | String | ✅ | Gmail الكامل (PK) — مثال: `keeper.madinat@gmail.com` |
| B: `StoreCode` | String | ✅ | كود الموقع من Locations؛ للأدمن: `*` |
| C: `Role` | String | ✅ | `Admin` \| `Keeper` \| `Viewer` |
| D: `FullName` | String | ❌ | اسم المستخدم للعرض |
| E: `IsActive` | Boolean | ✅ | `TRUE` — لتعطيل مستخدم: اجعلها `FALSE` (لا تحذف) |
| F: `AddedDate` | Date | ✅ | تاريخ الإضافة (يُملأ تلقائياً) |

**قواعد الصلاحية:**

| الدور | StoreCode | ما يستطيع فعله |
|-------|-----------|---------------|
| `Admin` | `*` | كل شيء في كل المخازن |
| `Keeper` | كود محدد | معاملات + عرض مخزنه فقط |
| `Viewer` | كود محدد أو `*` | عرض بدون تعديل |

---

## 6. جدول Counters

**الدور:** توليد TxnID آمن بدون race condition.

| العمود | النوع | الوصف |
|--------|-------|-------|
| A: `Prefix` | String | `REC` \| `ISS` \| `ADJ` \| `TRF` |
| B: `Year` | Number | السنة الحالية (يُعاد للصفر كل سنة) |
| C: `LastSeq` | Number | آخر رقم تسلسلي مُستخدَم |

**مثال على البيانات:**

| Prefix | Year | LastSeq |
|--------|------|---------|
| REC | 2026 | 42 |
| ISS | 2026 | 137 |
| ADJ | 2026 | 8 |
| TRF | 2026 | 23 |

**لماذا هذا الجدول:** بدلاً من مسح Stock_Movement كل مرة لإيجاد أعلى رقم (O(n) هش)، نقرأ ونزيد صفاً واحداً داخل LockService.

---

## 7. جدول Audit_Log

**الدور:** سجل المراجعة الكامل — من فعل ماذا ومتى.

| العمود | النوع | الوصف |
|--------|-------|-------|
| A: `LogID` | Number | رقم تسلسلي تلقائي |
| B: `Timestamp` | DateTime | وقت الحدث (new Date()) |
| C: `UserEmail` | String | من فعل الحدث |
| D: `Action` | String | `TRANSACTION_SUBMITTED` \| `USER_ADDED` \| `USER_DEACTIVATED` \| `ITEM_ADDED` \| `LOGIN` \| `UNAUTHORIZED_ACCESS` |
| E: `Entity` | String | `Stock_Movement` \| `Users_Stores` \| `Master_Items` |
| F: `EntityID` | String | TxnID أو Email أو ItemCode حسب السياق |
| G: `Details` | String | JSON مضغوط بتفاصيل الحدث |

---

## 8. اتفاقيات التسمية

| العنصر | الاتفاقية | مثال |
|--------|-----------|-------|
| أسماء الجداول | PascalCase | `Stock_Movement` |
| أسماء الأعمدة | PascalCase | `ItemCode`, `UserEmail` |
| أكواد الأصناف | حروف كبيرة + أرقام | `ITEM-001`, `PHR-042` |
| أكواد المواقع | حروف كبيرة قصيرة | `MZ`, `L`, `AD` |
| TxnID | `{PREFIX}-{YYYY}-{NNNN}` | `REC-2026-0042` |
| TxnID للتحويل | + `-OUT` أو `-IN` | `TRF-2026-0023-OUT` |

---

## 9. حساب الرصيد (View Logic)

الرصيد لصنف في موقع = يُحسَب لحظياً بهذه المعادلة:

```
Balance(itemCode, location) =
  SUMIF(Stock_Movement, TxnType="Receipt" AND ItemCode=? AND Location=?, Qty)
  + SUMIF(Stock_Movement, TxnType="Adjustment" AND ItemCode=? AND Location=?, Qty)
  - SUMIF(Stock_Movement, TxnType="Issuance" AND ItemCode=? AND Location=?, Qty)

ملاحظة:
- Transfer OUT يُسجَّل كـ Issuance في Location المصدر
- Transfer IN يُسجَّل كـ Receipt في Location الوجهة
- Adjustment يمكن أن يكون سالباً في عمود Qty
```

في Apps Script يُترجَّم هذا إلى `getValues()` + `filter()` + `reduce()` — لا SUMIFS مباشر.

---

## 10. إعدادات Google Sheets المنصوح بها

| الإعداد | القيمة |
|---------|--------|
| إذونات الملف | الأدمن فقط (Editor) — المستخدمون لا يفتحونه مباشرة |
| Locale | Arabic (Saudi Arabia) أو بحسب المتطلبات |
| Timezone | Asia/Dubai أو بحسب الموقع |
| تجميد الصف الأول | في كل الجداول |
| حماية الأوراق | كل الأوراق محمية ضد التعديل المباشر (إلا الأدمن) |
