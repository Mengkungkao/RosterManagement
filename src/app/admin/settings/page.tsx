import { requireAdmin } from "@/lib/admin-auth";
import { type AppData, loadAll } from "@/lib/config-sheet";
import { card, mutedText } from "../../ui";
import AdminFrame, { errorMessage } from "../AdminFrame";
import MatchingForm from "./MatchingForm";
import PaySettingsForm from "./PaySettingsForm";
import SkillsEditor from "./SkillsEditor";
import TaskTypesEditor from "./TaskTypesEditor";
import TemplatesEditor from "./TemplatesEditor";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "task-types", title: "Task types" },
  { id: "skills", title: "Skills and qualifications" },
  { id: "templates", title: "Event templates" },
  { id: "matching", title: "Matching" },
  { id: "pay", title: "Pay and award" },
];

function Section({ id, title, detail, children }: { id: string; title: string; detail: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`mt-6 scroll-mt-4 p-5 ${card}`}>
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className={`mt-0.5 mb-4 text-sm ${mutedText}`}>{detail}</p>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  await requireAdmin();

  let data: AppData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadAll();
  } catch (err) {
    loadError = errorMessage(err);
  }

  return (
    <AdminFrame
      title="Settings"
      description="The lists and rules behind rostering. The built-in defaults work as they are; change them when your venue needs to."
      loadError={loadError}
    >
      {data && (
        <>
          <nav aria-label="Settings sections" className="mt-4 flex flex-wrap gap-2 text-sm">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                {s.title}
              </a>
            ))}
          </nav>
          <Section id="task-types" title="Task types" detail="The kinds of work an event can need. An event copies a type's requirements when the task is added, so editing a type doesn't change existing events.">
            <TaskTypesEditor taskTypes={data.taskTypes} skills={data.skills} />
          </Section>
          <Section id="skills" title="Skills and qualifications" detail="What can be recorded on a staff profile. Qualifications can have an expiry date.">
            <SkillsEditor skills={data.skills} />
          </Section>
          <Section id="templates" title="Event templates" detail="Staffing structures for recurring events, offered when creating an event.">
            <TemplatesEditor templates={data.templates} />
          </Section>
          <Section id="matching" title="Matching" detail="How Generate roster chooses between people who can all work a position.">
            <MatchingForm matching={data.settings.matching} />
          </Section>
          <Section id="pay" title="Pay and award" detail="Pay fortnight, public holidays and award rates for the wage estimates.">
            <PaySettingsForm key={JSON.stringify(data.settings)} settings={data.settings} />
          </Section>
        </>
      )}
    </AdminFrame>
  );
}
