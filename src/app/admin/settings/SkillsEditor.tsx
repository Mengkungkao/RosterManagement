"use client";

import { useState } from "react";
import type { SkillDef } from "@/lib/skills";
import { input, messageClass, mutedText, primaryButton, secondaryButton } from "../../ui";
import { move, useSaver } from "./useSaver";

// The skills and qualifications recorded on staff profiles and required by tasks.
export default function SkillsEditor({ skills }: { skills: SkillDef[] }) {
  const [list, setList] = useState(skills);
  const { save, saving, message } = useSaver();
  const dirty = JSON.stringify(list) !== JSON.stringify(skills);
  const set = (i: number, change: Partial<SkillDef>) => setList(list.map((s, j) => (j === i ? { ...s, ...change } : s)));

  return (
    <div>
      <ul className="space-y-2">
        {list.map((s, i) => (
          <li key={s.id || `new-${i}`} className={`flex flex-wrap items-center gap-2 ${s.active ? "" : "opacity-60"}`}>
            <input value={s.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Name" placeholder="Name" className={`min-w-48 flex-1 ${input}`} />
            <select value={s.kind} onChange={(e) => set(i, { kind: e.target.value as SkillDef["kind"] })} aria-label="Kind" className={input}>
              <option value="skill">Skill</option>
              <option value="qualification">Qualification (can expire)</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={s.active} onChange={(e) => set(i, { active: e.target.checked })} />
              Active
            </label>
            <button type="button" onClick={() => setList(move(list, i, -1))} disabled={i === 0} className={`${secondaryButton} px-2 py-1`} aria-label={`Move ${s.name} up`}>
              ↑
            </button>
            <button type="button" onClick={() => setList(move(list, i, 1))} disabled={i === list.length - 1} className={`${secondaryButton} px-2 py-1`} aria-label={`Move ${s.name} down`}>
              ↓
            </button>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-xs ${mutedText}`}>
        Disable rather than delete: people&apos;s records are kept, and nothing that depends on a skill breaks.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setList([...list, { id: "", name: "", kind: "skill", active: true }])} className={secondaryButton}>
          + New skill or qualification
        </button>
        <button type="button" disabled={saving || !dirty} onClick={() => save("/api/admin/config/skills", { skills: list }, "Skills saved.")} className={primaryButton}>
          {saving ? "Saving…" : "Save skills"}
        </button>
        {dirty && <span className={`text-sm ${mutedText}`}>Unsaved changes</span>}
        {message && <span className={`text-sm ${messageClass(message.type)}`}>{message.text}</span>}
      </div>
    </div>
  );
}
