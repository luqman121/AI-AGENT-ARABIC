import type { BadgeTone } from "./ui";

export const ROLE_LABEL: Record<string, string> = {
  admin: "مدير",
  support: "دعم",
  user: "مستخدم",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

export const PLAN_LABEL: Record<string, string> = {
  free: "مجاني",
  pro: "احترافي",
  business: "أعمال",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "في الانتظار",
  running: "قيد التشغيل",
  succeeded: "اكتمل",
  failed: "فشل",
  cancelled: "أُلغي",
};

export const RUN_KIND_LABEL: Record<string, string> = {
  planning: "تخطيط",
  execution: "تنفيذ",
};

export const OUTPUT_KIND_LABEL: Record<string, string> = {
  static_site: "موقع",
  web_app: "تطبيق",
  pdf: "PDF",
  spreadsheet: "جدول",
  image: "صورة",
  audio: "صوت",
  document: "مستند",
  presentation: "عرض",
  other: "أخرى",
};

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  archived: "مؤرشف",
};

export function runStatusTone(status: string): BadgeTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "accent";
    case "queued":
      return "info";
    default:
      return "neutral";
  }
}

export function accountStatusTone(status: string): BadgeTone {
  return status === "suspended" ? "danger" : "success";
}

export function roleTone(role: string): BadgeTone {
  return role === "admin" ? "accent" : role === "support" ? "info" : "neutral";
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "account.suspended": "إيقاف حساب",
  "account.reactivated": "إعادة تفعيل حساب",
  "user.role_changed": "تغيير الدور",
  "user.plan_changed": "تغيير الخطة",
  "user.limit_changed": "تغيير حد الاستخدام",
  "run.cancelled": "إلغاء تشغيل",
  "run.retried": "إعادة تشغيل",
  "project.archived": "أرشفة مشروع",
};

export const TARGET_TYPE_LABEL: Record<string, string> = {
  user: "مستخدم",
  run: "تشغيل",
  project: "مشروع",
};

export function labelFor(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key;
}
