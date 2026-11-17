"use client";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { ActionResult } from "@/types";

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}

/** Shows inline error + toast for a server action result. */
export function FormResult({ state, toastSuccess = true }: { state: ActionResult<unknown> | null; toastSuccess?: boolean }) {
  const last = useRef<ActionResult<unknown> | null>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok && state.message && toastSuccess) toast.success(state.message);
    if (!state.ok) toast.error(state.error);
  }, [state, toastSuccess]);
  if (!state) return null;
  if (!state.ok) return <Alert tone="error">{state.error}</Alert>;
  if (state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function fieldError(state: ActionResult<unknown> | null, name: string) {
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[name];
}
