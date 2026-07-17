import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "تحقق من بريدك",
};

export default function CheckEmailPage() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center px-6 py-10"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent-subtle">
          <MailCheck aria-hidden className="size-8 text-fg-accent" />
        </span>
        <h1 className="text-2xl font-bold text-fg">تحقق من بريدك</h1>
        <p className="max-w-[40ch] text-base leading-7 text-fg-2">
          أرسلنا رابط دخول إلى بريدك الإلكتروني. افتح الرسالة واضغط على الرابط للمتابعة. الرابط صالح
          لساعة واحدة ولمرة واحدة فقط.
        </p>
        <Link
          href="/sign-in"
          className="wk-focus-ring inline-flex min-h-11 items-center rounded-md px-4 text-base font-semibold text-fg-accent"
        >
          الرجوع إلى تسجيل الدخول
        </Link>
      </div>
    </main>
  );
}
