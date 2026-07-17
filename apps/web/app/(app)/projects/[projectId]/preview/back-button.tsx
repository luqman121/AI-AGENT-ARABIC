"use client";

import { IconButton } from "@wakil/ui";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackToProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  return (
    <IconButton label="الرجوع إلى المشروع" onClick={() => router.push(`/projects/${projectId}`)}>
      <ArrowRight aria-hidden className="size-5" />
    </IconButton>
  );
}
