"use client";

import { RequestComposer } from "@wakil/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../src/lib/idempotency-key";
import { createProjectAction } from "../../../src/server/actions/projects";

/**
 * The signature create flow: one composer, one idea. The server derives a
 * project title from the request text so the user never has to name it
 * before Wakil starts working. A failed submission keeps the text visibly
 * unsaved with a real retry; the idempotency key is reused across retries
 * of the same attempt so reconnects cannot create duplicates.
 */
export function CreateProjectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | undefined>(undefined);

  function submit() {
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await createProjectAction({
          idempotencyKey: attemptKey,
          request,
        });
        if (result.ok) {
          setError(undefined);
          setAttemptKey(newIdempotencyKey());
          router.push(`/projects/${result.data.projectId}?autostart=1`);
          return;
        }
        setError(result.fieldErrors?.["request"] ?? result.message);
      } catch {
        // Network failure: the request stays visibly unsaved with a retry.
        setError("تعذّر حفظ الطلب. تحقق من الاتصال ثم أعد المحاولة.");
      }
    });
  }

  return (
    <RequestComposer
      label="اوصف فكرتك"
      placeholder="اكتب فكرتك بالعربي… مثل: أبي موقعًا لمطعمي فيه قائمة الطعام وأرقام التواصل"
      value={request}
      onValueChange={(value) => {
        setRequest(value);
        if (error) setError(undefined);
      }}
      onSubmit={submit}
      pending={pending}
      error={error}
    />
  );
}
