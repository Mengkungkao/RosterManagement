"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

// An unexpected error while showing a page. Saved data is unaffected.
export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon="alertCircle"
      title="This page couldn't be shown"
      action={
        <Button variant="primary" icon="refresh" onClick={reset}>
          Try again
        </Button>
      }
    >
      {error.message || "Something unexpected happened"}. Nothing you saved has been lost.
    </EmptyState>
  );
}
