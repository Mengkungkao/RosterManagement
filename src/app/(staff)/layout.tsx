import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { FeedbackProvider } from "@/components/ui/feedback";
import StaffNav from "./StaffNav";

// The staff-facing pages: availability and shifts, built for phones.
export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <FeedbackProvider>
      <div className="flex min-h-dvh flex-col bg-canvas">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-fg">
                <Icon name="roster" size={15} />
              </span>
              <span className="hidden sm:inline">RosterManagement</span>
            </Link>
            <StaffNav />
          </div>
        </header>
        <main className="flex-1 px-4 pt-5 pb-12">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </FeedbackProvider>
  );
}
