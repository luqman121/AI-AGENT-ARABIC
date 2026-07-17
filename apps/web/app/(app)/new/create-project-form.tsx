"use client";

import { Button, StatusBanner, TextareaField, TextField } from "@wakil/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../src/lib/idempotency-key";
import { createProjectAction } from "../../../src/server/actions/projects";

type FormFailure = {
  message: string;
  retryable: boolean;
  fieldErrors: Record<string, string>;
};

/**
 * The signature create flow. A failed submission keeps the text visibly
 * unsaved with a real retry; the idempotency key is reused across retries
 * of the same attempt so reconnects cannot create duplicates.
 */
export function CreateProjectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [request, setRequest] = useState("");
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [failure, setFailure] = useState<FormFailure | null>(null);

  function submit() {
    startTransition(async () => {
      try {
        const result = await createProjectAction({
          idempotencyKey: attemptKey,
          request,
          title,
        });
        if (result.ok) {
          setFailure(null);
          setAttemptKey(newIdempotencyKey());
          router.push(`/projects/${result.data.projectId}`);
          return;
        }
        setFailure({
          fieldErrors: result.fieldErrors ?? {},
          message: result.message,
          retryable: result.retryable,
        });
      } catch {
        // Network failure: the request stays visibly unsaved with a retry.
        setFailure({
          fieldErrors: {},
          message: "تعذّر حفظ الطلب. تحقق من الاتصال ثم أعد المحاولة.",
          retryable: true,
        });
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      {failure && Object.keys(failure.fieldErrors).length === 0 ? (
        <StatusBanner tone="danger">{failure.message}</StatusBanner>
      ) : null}
      <TextField
        label="اسم المشروع"
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="مثال: موقع مطعم البيت"
        error={failure?.fieldErrors["title"]}
        maxLength={120}
        required
      />
      <TextareaField
        label="اوصف طلبك"
        name="request"
        value={request}
        onChange={(event) => setRequest(event.target.value)}
        placeholder="اكتب ما تحتاجه بالتفصيل، مثل: أبي موقعًا لمطعمي فيه قائمة الطعام وأرقام التواصل"
        hint="كلما كان وصفك أدق، كانت النتيجة أقرب لما تريد."
        error={failure?.fieldErrors["request"]}
        rows={6}
        required
      />
      <Button type="submit" loading={pending}>
        {failure?.retryable ? "أعد المحاولة" : "إنشاء المشروع"}
      </Button>
      <p className="text-sm leading-6 text-fg-3">
        سيُحفظ طلبك في مشروع جديد. تنفيذ الطلبات سيتوفر في مرحلة قادمة.
      </p>
    </form>
  );
}
