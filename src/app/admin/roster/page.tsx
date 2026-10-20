import { redirect } from "next/navigation";

// Roster Match moved to /admin; keeps old bookmarks working.
export default function OldRosterPage() {
  redirect("/admin");
}
