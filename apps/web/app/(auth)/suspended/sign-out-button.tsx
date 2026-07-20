"use client";

import { Button } from "@wakil/ui";
import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { signOutAction } from "../../../src/server/actions/auth";

export function SuspendedSignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={pending}
      onClick={() => startTransition(() => signOutAction())}
    >
      <LogOut aria-hidden className="size-5" />
      تسجيل الخروج
    </Button>
  );
}
