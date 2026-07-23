import type { OutputKind } from "@wakil/shared";

export type OutputCapability = {
  accept: string;
  disabledReason?: string;
  enabled: boolean;
  id:
    "app" | "audio" | "document" | "excel" | "image" | "other" | "pdf" | "presentation" | "website";
  label: string;
  outputKind: OutputKind;
  placeholder: string;
};

const NOT_AVAILABLE = "هذا النوع يحتاج مولّدًا حقيقيًا في الخادم، وسيُفعّل بعد اكتمال دعمه.";

export const OUTPUT_CAPABILITIES: readonly OutputCapability[] = [
  {
    accept: "image/*,application/pdf,text/plain,.doc,.docx",
    enabled: true,
    id: "website",
    label: "موقع",
    outputKind: "static_site",
    placeholder: "مثال: أنشئ لي موقعًا عربيًا لشركة عقارية مع نموذج لحجز موعد…",
  },
  {
    accept: "image/*,application/pdf,text/plain,.doc,.docx",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "app",
    label: "تطبيق",
    outputKind: "web_app",
    placeholder: "مثال: أنشئ تطبيقًا لإدارة طلبات متجر صغير مع لوحة متابعة واضحة…",
  },
  {
    accept: "image/*,application/pdf,text/plain,.doc,.docx",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "pdf",
    label: "PDF",
    outputKind: "pdf",
    placeholder: "مثال: جهّز تقرير PDF عربيًا منظمًا عن أداء المبيعات لهذا الشهر…",
  },
  {
    accept: ".csv,.xls,.xlsx,text/plain,application/pdf",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "excel",
    label: "Excel",
    outputKind: "spreadsheet",
    placeholder: "مثال: أنشئ ملف Excel لحساب المبيعات والمصاريف وصافي الربح…",
  },
  {
    accept: "image/*,application/pdf,text/plain,.ppt,.pptx",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "presentation",
    label: "عرض تقديمي",
    outputKind: "presentation",
    placeholder: "مثال: جهّز عرضًا تقديميًا عربيًا من 8 شرائح عن خطة إطلاق منتج جديد…",
  },
  {
    accept: "image/*,application/pdf,text/plain",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "image",
    label: "صورة",
    outputKind: "image",
    placeholder: "مثال: أنشئ صورة إعلانية فاخرة لعطر عربي بخلفية داكنة…",
  },
  {
    accept: "audio/*,text/plain,application/pdf,.doc,.docx",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "audio",
    label: "صوت",
    outputKind: "audio",
    placeholder: "مثال: حوّل هذا النص إلى تعليق صوتي عربي هادئ وواضح…",
  },
  {
    accept: "image/*,application/pdf,text/plain,.doc,.docx",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "document",
    label: "مستند",
    outputKind: "document",
    placeholder: "مثال: اكتب عرضًا تجاريًا عربيًا منظمًا لخدمة إدارة الإعلانات…",
  },
  {
    accept: "image/*,audio/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx",
    disabledReason: NOT_AVAILABLE,
    enabled: false,
    id: "other",
    label: "المزيد",
    outputKind: "other",
    placeholder: "اكتب ما تريد من وكيل أن ينجزه، وأضف الملفات التي تساعده…",
  },
] as const;

export function outputCapabilityById(id: string): OutputCapability {
  return OUTPUT_CAPABILITIES.find((capability) => capability.id === id) ?? OUTPUT_CAPABILITIES[0]!;
}
