"use client";

import { StatusBanner } from "@wakil/ui";
import { RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useTransition } from "react";

import { connectivityReducer } from "../../src/lib/connectivity";

/** Global offline/reconnecting banner under the app header. */
export function ConnectivityBanner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(connectivityReducer, "online" as const);

  useEffect(() => {
    if (!navigator.onLine) dispatch("went-offline");

    const handleOffline = () => dispatch("went-offline");
    const handleOnline = () => {
      dispatch("went-online");
      // A real refresh backs the reconnecting state.
      startTransition(() => router.refresh());
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [router]);

  useEffect(() => {
    if (!isPending && state === "reconnecting") dispatch("refresh-complete");
  }, [isPending, state]);

  if (state === "online") return null;

  return (
    <div className="fixed inset-x-0 top-14 z-(--wk-z-banner) mx-auto w-full max-w-160 px-4 pt-2">
      {state === "offline" ? (
        <StatusBanner tone="warning" icon={WifiOff}>
          لا يوجد اتصال بالإنترنت. ستبقى بياناتك المحفوظة كما هي.
        </StatusBanner>
      ) : (
        <StatusBanner tone="info" icon={RefreshCw}>
          عاد الاتصال، جارٍ تحديث البيانات…
        </StatusBanner>
      )}
    </div>
  );
}
