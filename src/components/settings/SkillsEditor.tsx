"use client";

import { useState } from "react";
import type { SkillDef } from "@/lib/skills";
import { Badge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { Checkbox, Input, Select } from "../ui/Field";
import { cn } from "../ui/cn";
import { SaveBar } from "./SaveBar";
import { move, useSaver } from "./useSaver";

// The skills and qualifications recorded on staff profiles and required by tasks.
export default function SkillsEditor({ skills }: { skills: SkillDef[] }) {
  const [list, setList] = useState(skills);
  const { save, saving, error } = useSaver();
  const dirty = JSON.stringify(list) !== JSON.stringify(skills);
  const set = (i: number, change: Partial<SkillDef>) => setList(list.map((s, j) => (j === i ? { ...s, ...change } : s)));

  return (
    <div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.map((s, i) => (
          <li key={s.id || `new-${i}`} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !s.active && "bg-surface-2")}>
            <Input value={s.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Name" placeholder="Name" className="min-w-48 flex-1" />
            <Select value={s.kind} onChange={(e) => set(i, { kind: e.target.value as SkillDef["kind"] })} aria-label="Kind" className="w-full sm:w-52">
              <option value="skill">Skill</option>
              <option value="qualification">Qualification (can expire)</option>
            </Select>
            <Checkbox label="Active" checked={s.active} onChange={(e) => set(i, { active: e.target.checked })} />
            {!s.active && <Badge>Disabled</Badge>}
            <span className="flex">
              <IconButton icon="chevronUp" size="sm" label={`Move ${s.name || "skill"} up`} disabled={i === 0} onClick={() => setList(move(list, i, -1))} />
              <IconButton icon="chevronDown" size="sm" label={`Move ${s.name || "skill"} down`} disabled={i === list.length - 1} onClick={() => setList(move(list, i, 1))} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Disable rather than delete: people&apos;s records are kept, and nothing that depends on a skill breaks.</p>
      <SaveBar
        label="Save skills"
        dirty={dirty}
        saving={saving}
        error={error}
        onReset={() => setList(skills)}
        onSave={() => save("/api/admin/config/skills", { skills: list }, "Skills and qualifications saved.")}
        extra={
          <Button icon="plus" onClick={() => setList([...list, { id: "", name: "", kind: "skill", active: true }])}>
            New skill or qualification
          </Button>
        }
      />
    </div>
  );
}
