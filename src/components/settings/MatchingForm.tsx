"use client";

import { useState } from "react";
import type { MatchingSettings } from "@/lib/settings";
import { Checkbox } from "../ui/Field";
import { SaveBar } from "./SaveBar";
import { useSaver } from "./useSaver";

const OPTIONS: { key: keyof MatchingSettings; title: string; detail: string }[] = [
  { key: "preferExperienced", title: "Prefer experienced staff", detail: "For tasks with a skill, people recorded as Experienced or Qualified come before others." },
  { key: "usePreferences", title: "Follow shift preferences", detail: "People who said they prefer that kind of shift (evenings, weekends…) come first." },
  { key: "keepTogether", title: "Keep staff on the same event", detail: "Someone already working the event just before or after (e.g. setup then service) comes first." },
];

export default function MatchingForm({ matching }: { matching: MatchingSettings }) {
  const [value, setValue] = useState(matching);
  const { save, saving, error } = useSaver();
  const dirty = JSON.stringify(value) !== JSON.stringify(matching);
  return (
    <div>
      <ol className="mb-4 list-decimal space-y-1 rounded-lg bg-surface-2 px-4 py-3 pl-8 text-[13px] text-fg-2">
        <li>
          <span className="font-medium text-fg">Checks everyone must pass</span> — availability and time off, no clash, current
          qualifications, verified skills, work restrictions, hour limits. Never switched off.
        </li>
        <li>
          <span className="font-medium text-fg">Hour rules</span> — part-timers short of their weekly hours first, then full-timers under
          76h, then everyone else; going over 76h only when no one else can.
        </li>
        <li>
          <span className="font-medium text-fg">These preferences</span> — below.
        </li>
        <li>
          <span className="font-medium text-fg">Fair shares</span> — whoever has the fewest hours this fortnight.
        </li>
      </ol>
      <div className="space-y-3">
        {OPTIONS.map((o) => (
          <Checkbox key={o.key} label={<span className="font-medium text-fg">{o.title}</span>} description={o.detail} checked={value[o.key]} onChange={(e) => setValue({ ...value, [o.key]: e.target.checked })} />
        ))}
      </div>
      <SaveBar label="Save matching" dirty={dirty} saving={saving} error={error} onReset={() => setValue(matching)} onSave={() => save("/api/admin/settings/matching", value, "Matching priorities saved.")} />
    </div>
  );
}
