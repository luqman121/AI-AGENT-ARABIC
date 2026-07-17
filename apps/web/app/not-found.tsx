import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center px-6 py-10"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent-subtle">
          <Compass aria-hidden className="size-8 text-fg-accent" />
        </span>
        <h1 className="text-2xl font-bold text-fg">الصفحة غير موجودة</h1>
        <p className="max-w-[40ch] text-base leading-7 text-fg-2">
          الرابط الذي فتحته غير صحيح أو لم يعد متاحًا.
        </p>
        <Link
          href="/"
          className="wk-focus-ring inline-flex min-h-12 items-center rounded-md bg-accent px-5 text-base font-semibold text-fg-on-accent"
        >
          الرجوع إلى البداية
        </Link>
      </div>
    </main>
  );
}
