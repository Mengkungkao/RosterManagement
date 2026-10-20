"use client";

import { useState } from "react";
import type { MatchingSettings } from "@/lib/settings";
import { messageClass, mutedText, primaryButton } from "../../ui";
import { useSaver } from "./useSaver";

const OPTIONS: { key: keyof MatchingSettings; title: string; detail: string }[] = [
  {
    key: "preferExperienced",
    title: "Prefer experienced staff",
    detail: "For tasks with a skill, people recorded as Experienced or Qualified come before others.",
  },
  {
    key: "usePreferences",
    title: "Follow shift preferences",
    detail: "People who said they prefer that kind of shift (evenings, weekends…) come first.",
  },
  {
    key: "keepTogether",
    title: "Keep staff on the same event",
    detail: "Someone already working the event just before or after (e.g. setup then service) comes first.",
  },
];

export default function MatchingForm({ matching }: { matching: MatchingSettings }) {
  const [value, setValue] = useState(matching);
  const { save, saving, message } = useSaver();
  return (
    <div>
      <p className={`text-sm ${mutedText}`}>
        Generate roster first checks everyone against the rules — availability, clashes, qualifications, skills,
        restrictions, hour limits — and only then ranks those who pass: part-timers short of their hours, full-timers
        under 76h, then these preferences, then whoever has the fewest hours this fortnight. These switches never let
        anyone past a rule.
      </p>
      <div className="mt-3 space-y-2">
        {OPTIONS.map((o) => (
          <label key={o.key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={value[o.key]} onChange={(e) => setValue({ ...value, [o.key]: e.target.checked })} />
            <span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{o.title}</span>
              <span className={`block text-xs ${mutedText}`}>{o.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={saving} onClick={() => save("/api/admin/settings/matching", value, "Matching saved.")} className={primaryButton}>
          {saving ? "Saving…" : "Save matching"}
        </button>
        {message && <span className={`text-sm ${messageClass(message.type)}`}>{message.text}</span>}
      </div>
    </div>
  );
}
