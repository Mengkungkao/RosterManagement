import type { StaffMember } from "@/lib/staff";

// What a staff member sees of their own requests.
export function ownRequests(me: StaffMember | null) {
  return (me?.requests ?? [])
    .filter((r) => r.status !== "withdrawn")
    .map(({ id, kind, from, to, eventName, note, status }) => ({ id, kind, from, to, eventName, note, status }));
}
