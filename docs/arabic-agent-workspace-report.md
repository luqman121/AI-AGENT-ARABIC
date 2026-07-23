# تقرير تنفيذ مساحة وكيل العربية

التاريخ: 2026-07-23 الفرع المحلي: `feat/arabic-agent-workspace-ui` الأساس عند بدء العمل:
`49854de08cb4e7cddeaf88fc28549416964267c2` حالة النشر: لم يحدث دفع أو نشر، والنسخة الحية لم تتغير.

## النطاق المنفذ

حُسنت الرحلة الحالية دون استبدال المعمارية:

```text
Home → Submit → Project → Planning SSE → Review plan → Explicit execution
→ Execution SSE → Artifact → Authorized preview/download → Follow-up
```

### الصفحة الرئيسية

- واجهة عربية prompt-first بالنص المطلوب.
- composer الحالي بقي مصدر الإنشاء الوحيد.
- عرض أحدث المشاريع من PostgreSQL ضمن مساحة المستخدم، بروابط مشاريع حقيقية.
- سجل مركزي لقدرات المخرجات؛ `static_site` فقط مفعّل لأن له مولدًا حقيقيًا.
- الأنواع الأخرى ظاهرة ومعطلة بسبب واضح، دون طلبات API أو تقدم وهمي.

### مساحة العمل

- تنقل محمول بين المحادثة والمعاينة والنشاط.
- الحفاظ على تخطيط سطح المكتب الحالي.
- زر انتقال إلى أحدث رسالة يظهر عند ابتعاد المستخدم عن أسفل المحادثة.
- استمرار التقدم من `run_events` وSSE الحقيقيين دون مؤقتات محلية.
- استعادة بوابة الخطة المقفلة في `GOAL.md`: نجاح التخطيط لا يبدأ التنفيذ تلقائيًا؛ يظهر زر
  `ابدأ إنشاء الموقع`، ويستخدم `startRunAction` الحالي بنوع `execution`.

### النتائج والمعاينة

- metadata مركزية لعرض أنواع artifacts وتسمياتها وإجراءاتها.
- المعاينة تظهر فقط للنوع الذي يمتلك viewer حقيقيًا حاليًا (`static_site`).
- أدوات desktop/tablet/mobile، refresh، تبويب جديد، full-screen، وعنوان تقني LTR.
- مرحلتا 390 و768 ثابتتان وقابلتان للتمرير بدل الانكماش داخل حاوية 640px.
- iframe بقي على origin منفصل مع `sandbox="allow-scripts"` و`referrerPolicy="no-referrer"`.
- الرابط المنسوخ هو مسار التطبيق المصرح، وليس signed object URL.
- أزيل وصف «مشاركة» المضلل؛ الإجراء الآن «نسخ رابط خاص» مع توضيح أنه يتطلب تسجيل الدخول إلى مساحة
  العمل.
- أخفي إجراء إعادة الإنشاء الذي لا يملك عقد version/retry سليمًا مع قيد execution الحالي.

### الحدود المتعمدة

- `visualEditing: false`؛ لا يوجد DOM-to-source mapping أو mutation API آمن.
- لا مولدات PDF/Excel/Presentation/Image/Audio/Document.
- لا terminal أو file tree أو editor أو shell input وهمي.
- لا publish workflow أو مشاركة عامة جديدة.
- لا تغيير في DB schema أو migrations أو API contracts أو worker contracts.

## التدقيق المعماري

المكونات المحفوظة:

- Next.js 16، React 19، TypeScript، Tailwind و`@wakil/ui`.
- Auth.js وعزل tenant/workspace.
- PostgreSQL/Drizzle مصدر الحقيقة.
- BullMQ/Redis والعامل المنفصل.
- persisted run events وSSE replay عبر `Last-Event-ID`.
- Daytona validation والتخزين الخاص المتوافق مع S3/R2.
- روابط preview/download الموقعة والمقيدة بالمشروع والمستخدم.

## المصادر المفتوحة

- Adorable: MIT، commit `35d6b1bd9139`.
- bolt.diy: MIT، commit `2e254ac19a69`.
- Onlook: Apache-2.0، commit `423e2e924366`.
- Vibra Code: AGPL-3.0، commit `0a8524a68899`؛ استُخدم مرجع UX محمول فقط.

لم يُنسخ كود خارجي. التفاصيل في `docs/OPEN_SOURCE_REFERENCES.md`.

## طبقة المنتج الجديدة

- `apps/web/src/product/messages.ar.ts`
- `apps/web/src/product/output-capabilities.ts`
- `apps/web/src/product/artifact-presentations.ts`
- `apps/web/src/product/feature-flags.ts`

هذه الطبقة ليست نظام i18n كاملًا، لكنها تمنع تكرار النصوص والقدرات الجديدة في المكونات المعدلة.

## الاختبارات

أضيفت تغطية مباشرة لـ:

- capability registry والأنواع المعطلة.
- artifact presentation والـfeature flags.
- recent projects.
- mobile workspace navigation.
- preview controls، sandbox، LTR، viewport persistence، clipboard وfull-screen fallback.
- private artifact-link semantics وclipboard failure.
- بوابة الخطة: لا يبدأ execution قبل ضغط المستخدم، ثم يبدأ بنوع `execution`.
- UI type-pill للحالات المدعومة والمعطلة.
- assertions إضافية في Playwright للصفحة العربية، المشاريع الحديثة، التنقل المحمول، وأدوات المعاينة.

### النتائج النهائية

```text
pnpm format:check   PASS
pnpm lint           PASS — 10/10 package tasks
pnpm typecheck      PASS — 10/10 package tasks
pnpm test           PASS — 17/17 package tasks
@wakil/web          PASS — 14 files, 55 tests
@wakil/ui           PASS — 3 files, 28 tests
pnpm build          PASS — 9/9 build tasks
git diff --check    PASS
```

بناء Next الإنتاجي شمل `/new` و`/projects/[projectId]` و`/projects/[projectId]/preview` ومسارات auth
وhealth وartifact الحالية.

### الاختبارات المحجوبة بالبيئة

شُغلت الأوامر ولم تُتجاوز:

```text
pnpm test:integration
→ لا يوجد container runtime صالح لـ Testcontainers.

pnpm --filter @wakil/web test:e2e -- --project=mobile-390
→ لا يوجد .env.local ولا PostgreSQL/Redis/R2/worker محلي، ولا Docker/Podman.
```

لذلك لا يُدعى نجاح Playwright أو screenshot regression أو فحص responsive بصري كامل. اختبارات jsdom
وE2E assertions موجودة، لكن يلزم stack محلي حقيقي لتشغيل Playwright.

## تغييرات قاعدة البيانات

لا توجد تغييرات:

- لا migration.
- لا schema edit.
- لا reset أو seed إنتاجي.
- لا تعديل tenant ownership.

## مخاطر سابقة اكتشفها التدقيق ولم تُحل في هذه الشريحة

1. `infra/docker-compose.production.yml`: يجب إثبات egress للعامل المتصل بشبكة `internal: true` قبل
   أي نشر؛ العامل يحتاج مزودي النماذج وDaytona وR2.
2. المرفقات والصوت تُرفع وتُخزن، لكن العامل يقرأ نص أحدث رسالة ولا يستهلك `messageAttachments` أو
   يجري تفريغًا صوتيًا. لا ينبغي تسويقها كمدخل وكيل مكتمل قبل ربط ingestion حقيقي.
3. صفحة `/usage` تعرض empty state ثابتًا رغم وجود token/cost/duration fields في runs.
4. retry لإجراء execution الفاشل يحتاج عقدًا واضحًا يراعي unique plan/kind constraint؛ لذلك أُخفي
   rebuild من بطاقة النتيجة بدل الادعاء بأنه يعمل.
5. `run_tasks` موجود في المخطط وغير مستخدم؛ واجهة المراحل تعتمد أحداث التشغيل الحالية.
6. `@visual` يكتب screenshots مباشرة ولا يستخدم `toHaveScreenshot`، ولذلك ليس بوابة visual
   regression حقيقية.
7. يلزم لاحقًا جعل إلغاء التشغيل متاحًا قرب composer، وحصر رسالة الخطة داخل تفاصيل النشاط بعد
   refresh، وإضافة تاريخ واضح للإصدارات السابقة.
8. CI لا يشغل حاليًا Playwright mobile أو storage health أو production smoke.

هذه البنود تحتاج milestones مستقلة واختبارات بنية تحتية؛ لم تُخف أو تُحوّل إلى UI وهمي.

## التشغيل المحلي

```bash
cd /root/work/AI-AGENT-ARABIC
pnpm install
cp .env.example .env.local
# أدخل قيم تطوير محلية فقط
pnpm db:migrate
pnpm dev
```

بوابات الجودة:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

مع Docker وبيئة الاختبار:

```bash
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:visual
```

## النشر المستقبلي

لم يُنفذ أي نشر. قبل النشر:

1. معالجة/إثبات egress في Compose الإنتاجي.
2. تشغيل migration/integration/container/storage/smoke gates.
3. تشغيل Playwright عند 390 و430 وإضافة desktop 1440.
4. تحويل الصور إلى `toHaveScreenshot` ومراجعة baselines.
5. فحص keyboard، focus، Axe، console/network، refresh/reconnect والحالات الفاشلة.
6. مراجعة الفرع ثم دمجه بإجراء منفصل ومصرح به.

لا تستخدم بيانات الإنتاج في تشغيل E2E، ولا تنشر هذه الشريحة قبل اجتياز البوابات المحجوبة أعلاه.
