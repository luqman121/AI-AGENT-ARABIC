/**
 * Stable application error codes shared by server services and UI.
 * Codes are the machine contract; Arabic messages are the only user-facing text.
 * Messages never include SQL, stack traces, provider names, or tenant details.
 */
export const APP_ERROR_CODES = [
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "PROJECT_ARCHIVED",
  "RUN_ALREADY_ACTIVE",
  "INTERNAL_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const APP_ERROR_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "سجّل الدخول للمتابعة.",
  NOT_FOUND: "المشروع غير موجود أو لا تملك صلاحية الوصول إليه.",
  VALIDATION_FAILED: "تحقق من الحقول المطلوبة ثم أعد المحاولة.",
  RATE_LIMITED: "طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
  IDEMPOTENCY_CONFLICT:
    "تعذّر تنفيذ الطلب لأنه يختلف عن طلب سابق بالمعرّف نفسه. حدّث الصفحة ثم أعد المحاولة.",
  PROJECT_ARCHIVED: "لا يمكن التعديل على مشروع مؤرشف.",
  RUN_ALREADY_ACTIVE: "هناك تشغيل نشط بالفعل لهذا المشروع. انتظر انتهاءه أو ألغِه ثم أعد المحاولة.",
  INTERNAL_ERROR: "حدث خطأ غير متوقع. أعد المحاولة.",
};

export function messageForCode(code: AppErrorCode): string {
  return APP_ERROR_MESSAGES[code];
}

/** Normalized result returned by every mutation service and server action. */
export type ActionFailure = {
  ok: false;
  code: AppErrorCode;
  message: string;
  /** Retryable errors keep client data visibly unsaved and offer a retry. */
  retryable: boolean;
  /** Field-level Arabic messages for form validation failures. */
  fieldErrors?: Record<string, string>;
};

export type ActionSuccess<T> = {
  ok: true;
  data: T;
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

const RETRYABLE_CODES: ReadonlySet<AppErrorCode> = new Set(["RATE_LIMITED", "INTERNAL_ERROR"]);

export function failure(code: AppErrorCode, fieldErrors?: Record<string, string>): ActionFailure {
  return {
    ok: false,
    code,
    message: messageForCode(code),
    retryable: RETRYABLE_CODES.has(code),
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}

export function success<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}
