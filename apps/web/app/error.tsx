"use client";

import { Button, ErrorState } from "@wakil/ui";

/** Recoverable route failure with a real reset action; no technical leakage. */
export default function GlobalErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-160 flex-1 flex-col justify-center px-4">
      <ErrorState
        title="حدث خطأ غير متوقع"
        description="تعذّر عرض هذه الصفحة. أعد المحاولة، وإذا استمرت المشكلة أعد فتح التطبيق."
        action={<Button onClick={reset}>أعد المحاولة</Button>}
      />
    </main>
  );
}
