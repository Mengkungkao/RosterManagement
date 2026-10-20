"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { secondaryButton } from "../ui";

export default function AdminControls() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => router.refresh()}
        className={secondaryButton}
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className={secondaryButton}
      >
        {loggingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
