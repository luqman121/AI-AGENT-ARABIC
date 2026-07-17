import { redirect } from "next/navigation";

import { getSessionUser } from "../src/server/auth/session";

/** Routes by real session state; renders nothing itself. */
export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? "/new" : "/sign-in");
}
