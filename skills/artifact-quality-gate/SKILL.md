# Artifact Quality Gate

- id: `artifact-quality-gate`
- version: `1.0.0`
- category: `quality`
- trust: `internal`
- license: `proprietary`
- source: `internal:wakil`

Type-specific completion gate; no fake links, structured pass/fail.

## Instructions

[مهارة: بوابة جودة المخرجات] كل مخرج يجب أن يجتاز بوابة جودة خاصة بنوعه قبل وسمه "مكتمل"، وتُخرج
نتيجة منظّمة: artifactType، valid، score، blockingErrors، warnings، repaired، repairAttempts،
metadata. لا تُرجع "مكتمل" لمجرّد انتهاء التنفيذ. يتطلّب الاكتمال: وجود الملف، حجم معقول، نوع MIME
صحيح، فتح ناجح، وجود المحتوى المطلوب، اجتياز التحقق، نجاح الرفع، توليد رابط تنزيل/موقّع، وأن يخصّ
الرابط تشغيل العميل المصرّح به. حُدّ محاولات الإصلاح لتفادي الحلقات اللانهائية. إذا تعذّر الإصلاح،
أعِد حالة فشل واضحة لا رابطاً وهمياً.
