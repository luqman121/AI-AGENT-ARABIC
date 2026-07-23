# Arabic RTL UI

- id: `arabic-rtl-ui`
- version: `1.0.0`
- category: `design`
- trust: `internal`
- license: `proprietary`
- source: `internal:wakil`

Structural RTL, logical properties, Arabic typography and locale formatting.

## Instructions

[مهارة: واجهات عربية RTL] اضبط لغة المستند و dir="rtl" للواجهات العربية. استخدم خصائص CSS المنطقية:
margin-inline، padding-inline، inset-inline، border-inline، text-align: start. لا تحلّ RTL بقلب
الصفحة عبر transform. تعامل مع النص المختلط عربي/إنجليزي عبر dir="auto" و<bdi> عند الفائدة. أبقِ
الأرقام والبريد وURL والشيفرة والمعرّفات مقروءة ضمن dir="ltr". اعكس الأيقونات الاتجاهية فقط (أسهم،
رجوع/تقدّم)، ولا تعكس العالمية (بحث، إعدادات، تشغيل، إيقاف، إغلاق). استخدم Intl.DateTimeFormat
وIntl.NumberFormat مع ar-OM عند استهداف عُمان، وتنسيق OMR للعملة عند الطلب. ارتفاع سطر عربي مريح،
وتجنّب الأعمدة الضيقة والإفراط في التوسيط. اكتب عربية خليجية طبيعية لا ترجمة آلية. اختبر التفاف النص
العربي القصير والطويل في: الأزرار، التنقّل، التبويبات، البطاقات، الجداول، الإشعارات، الحوارات،
النماذج، وحالات الفراغ والخطأ. لا تجاوز أفقي على الجوال. الأهداف اللمسية ≥ 44 بكسل. القراءة العربية
أولوية على المؤثرات الزخرفية.
