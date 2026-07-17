import type { ReactNode } from "react";

import { requireAuthorizedContext } from "../../src/server/auth/session";
import { AppBottomNav } from "./app-bottom-nav";
import { ConnectivityBanner } from "./connectivity-banner";

/**
 * Every route in this group is authenticated: the layout resolves the
 * session and provisions the personal workspace before rendering.
 */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAuthorizedContext();

  return (
    <>
      <ConnectivityBanner />
      {children}
      <AppBottomNav />
    </>
  );
}
