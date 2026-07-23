# Premium Depth & Shadow

- id: `premium-depth-shadow`
- version: `1.0.0`
- category: `design`
- trust: `internal`
- license: `proprietary`
- source: `internal:wakil`

Controlled elevation system; shadows communicate depth, not decoration.

## Instructions

[مهارة: العمق والظل الراقي] عرّف رموز ارتفاع: --shadow-xs، --shadow-sm، --shadow-md، --shadow-lg،
--shadow-overlay، --shadow-focus. الظل يبلّغ عن ارتفاع أو تركيز، لا يزخرف كل عنصر. استخدم ظلالاً
طبقية خفيفة لا ظلاً واحداً داكناً كبيراً. افضّل الحدود وتباين الأسطح قبل زيادة شدّة الظل. لا تضع
ظلالاً قوية على كل بطاقة، ولا ظلال توهّج بنفسجية افتراضية. الوضع الداكن يتطلّب معالجة ظل وحدود
منفصلة. الحوارات والقوائم المنسدلة والعناصر العائمة قد تستخدم ارتفاعاً أعلى؛ البطاقات العادية تستخدم
حدّاً أو تحوّل سطح خفيف أو ظلاً صغيراً. تجنّب ظلال box-shadow المتحرّكة المكلفة؛ حرّك opacity
وtransform، واحترم prefers-reduced-motion. حافظ على سلّم ارتفاع صغير متسق.
