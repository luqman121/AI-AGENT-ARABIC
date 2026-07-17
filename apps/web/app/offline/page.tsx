import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "غير متصل",
};

// Static, cacheable, and free of any private project data by design.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center px-6 py-10"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-warning-subtle">
          <WifiOff aria-hidden className="size-8 text-fg-warning" />
        </span>
        <h1 className="text-2xl font-bold text-fg">لا يوجد اتصال بالإنترنت</h1>
        <p className="max-w-[40ch] text-base leading-7 text-fg-2">
          تحقق من اتصالك ثم أعد المحاولة. بياناتك المحفوظة في وكيل بأمان ولن تفقد شيئًا.
        </p>
        {/* A plain anchor forces a full network navigation out of the cached fallback. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="wk-focus-ring inline-flex min-h-12 items-center rounded-md bg-accent px-5 text-base font-semibold text-fg-on-accent"
        >
          إعادة المحاولة
        </a>
      </div>
    </main>
  );
}
