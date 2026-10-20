import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { isAdminRequest } from "@/lib/admin-auth";
import { getData } from "@/lib/data";
import { fortnightStartFor, melbourneToday } from "@/lib/dates";
import { buildDashboard } from "@/lib/overview";
import AppShell, { SIDEBAR_COOKIE } from "@/components/shell/AppShell";
import { FeedbackProvider } from "@/components/ui/feedback";

// Things that need a decision, for the bell in the top bar. Uses the same
// (cached) sheet read as the page, so it costs no extra request.
async function alertCount(): Promise<number | undefined> {
  try {
    const data = await getData();
    const today = melbourneToday();
    const pending = data.staff.reduce((sum, s) => sum + s.requests.filter((r) => r.status === "pending").length, 0);
    return buildDashboard(
      data.events,
      data.staff,
      data.settings,
      data.skills,
      today,
      fortnightStartFor(today, data.settings.fortnightStart),
      data.unreadableEvents,
      pending
    ).attentionCount;
  } catch {
    return undefined; // the page shows the load error
  }
}

export default async function AdminAppLayout({ children }: { children: ReactNode }) {
  // Pages send anyone signed out to the sign-in page; don't read the sheet for them.
  const signedIn = await isAdminRequest();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  return (
    <FeedbackProvider>
      <AppShell initialCollapsed={collapsed} alerts={signedIn ? await alertCount() : undefined}>
        {children}
      </AppShell>
    </FeedbackProvider>
  );
}
