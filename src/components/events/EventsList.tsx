"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatWeekdayDate, fortnightStartFor } from "@/lib/dates";
import type { EventRecord } from "@/lib/events";
import { eventTasks } from "@/lib/roster";
import { send } from "../admin/api";
import { Badge } from "../ui/Badge";
import { ButtonLink, IconButton } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SearchInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { Segmented } from "../ui/Segmented";
import { useConfirm, useToast } from "../ui/feedback";

type Show = "upcoming" | "drafts" | "past" | "all";

export default function EventsList({ events, today, anchor }: { events: EventRecord[]; today: string; anchor: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [refreshing, startRefresh] = useTransition();
  const [show, setShow] = useState<Show>("upcoming");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const counts = {
    upcoming: events.filter((e) => e.date >= today).length,
    drafts: events.filter((e) => e.status === "draft" && e.date >= today).length,
    past: events.filter((e) => e.date < today).length,
    all: events.length,
  };
  const shown = events
    .filter((e) =>
      show === "upcoming" ? e.date >= today : show === "drafts" ? e.status === "draft" && e.date >= today : show === "past" ? e.date < today : true
    )
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q));
  const ordered = show === "past" ? [...shown].reverse() : shown;
  const rosterLink = (e: EventRecord) => `/admin/roster?fortnight=${fortnightStartFor(e.date, anchor)}&event=${encodeURIComponent(e.id)}`;

  async function remove(event: EventRecord) {
    const rostered = event.staff.length;
    const ok = await confirm({
      title: `Delete “${event.name}”?`,
      description: (
        <>
          {formatWeekdayDate(event.date)} · {event.startTime}–{event.endTime}
          {event.location && ` · ${event.location}`}.{" "}
          {rostered > 0 ? `Its ${rostered} rostered shift${rostered === 1 ? "" : "s"} will be removed too. ` : ""}This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Delete event",
      tone: "danger",
    });
    if (!ok) return;
    const result = await send(`/api/admin/events/${encodeURIComponent(event.id)}`, "DELETE");
    if (!result.ok) {
      toast.error(`Couldn't delete “${event.name}”: ${result.error}`);
      return;
    }
    toast.success(`Deleted “${event.name}”.`);
    startRefresh(() => router.refresh());
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <Segmented<Show>
          label="Show"
          size="sm"
          value={show}
          onChange={setShow}
          options={[
            { value: "upcoming", label: `Upcoming · ${counts.upcoming}` },
            { value: "drafts", label: `Drafts · ${counts.drafts}` },
            { value: "past", label: `Past · ${counts.past}` },
            { value: "all", label: "All" },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search events or venues" label="Search events" className="w-full sm:ml-auto sm:w-64" />
      </div>
      {refreshing && <p className="px-4 pt-2 text-xs text-muted" role="status">Updating…</p>}
      {ordered.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={q ? "No events match" : show === "drafts" ? "No drafts" : show === "past" ? "No past events" : "No upcoming events"}
          action={!q && show !== "past" ? <ButtonLink variant="primary" icon="plus" href="/admin/events/new">Create event</ButtonLink> : undefined}
        />
      ) : (
        <ul className="divide-y divide-line">
          {ordered.map((event) => {
            const tasks = eventTasks(event);
            const positions = tasks.reduce((sum, t) => sum + t.count, 0);
            const people = new Set(event.staff.map((s) => s.name.toLowerCase())).size;
            return (
              <li key={event.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] ${event.date < today ? "opacity-70" : ""}`}>
                <div className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
                  <Link href={`/admin/events/${encodeURIComponent(event.id)}?from=events`} className="block truncate text-sm font-medium text-fg hover:underline">
                    {event.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {event.location || "No venue"}
                    {event.guests ? ` · ${event.guests} guests` : ""}
                  </p>
                </div>
                <div className="col-span-2 row-start-2 text-[13px] text-fg-2 tabular-nums sm:col-span-1 sm:row-start-auto">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="calendar" size={13} className="text-muted" />
                    {formatWeekdayDate(event.date)}
                  </span>
                  <span className="ml-2 text-muted">
                    {event.startTime}–{event.endTime}
                  </span>
                </div>
                <div className="col-span-2 row-start-3 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:row-start-auto">
                  {event.status === "draft" ? <Badge icon="circleDashed">Draft</Badge> : <Badge tone="success" icon="send">Published</Badge>}
                  <span className="text-xs text-muted tabular-nums">
                    {event.tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} · ` : ""}
                    {positions} position{positions === 1 ? "" : "s"} · {people} rostered
                  </span>
                </div>
                <div className="col-start-2 row-start-1 flex items-center justify-self-end sm:col-start-auto sm:row-start-auto">
                  <ButtonLink href={rosterLink(event)} size="sm" variant="ghost" className="hidden sm:inline-flex">
                    Roster
                  </ButtonLink>
                  <Menu
                    label={`Actions for ${event.name}`}
                    items={[
                      { label: "Open in roster", icon: "roster", href: rosterLink(event) },
                      { label: "Edit event", icon: "pencil", href: `/admin/events/${encodeURIComponent(event.id)}?from=events` },
                      { label: "Duplicate", icon: "copy", href: `/admin/events/new?copy=${encodeURIComponent(event.id)}` },
                      { label: "Delete", icon: "trash", tone: "danger", onSelect: () => remove(event) },
                    ]}
                    trigger={(p) => <IconButton icon="more" label={`Actions for ${event.name}`} size="sm" onClick={p.toggle} aria-expanded={p["aria-expanded"]} aria-haspopup="menu" />}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
