import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import type { AppData } from "@/lib/config-sheet";
import { getData } from "@/lib/data";
import MatchingForm from "@/components/settings/MatchingForm";
import PaySettingsForm from "@/components/settings/PaySettingsForm";
import SkillsEditor from "@/components/settings/SkillsEditor";
import TaskTypesEditor from "@/components/settings/TaskTypesEditor";
import TemplatesEditor from "@/components/settings/TemplatesEditor";
import { LoadError, PageHeader, errorMessage } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const SECTIONS: { id: string; title: string; icon: IconName; detail: string }[] = [
  {
    id: "task-types",
    title: "Task types",
    icon: "list",
    detail: "The kinds of work an event can need. Adding a task to an event copies the type's requirements, so changes here don't alter existing events.",
  },
  { id: "skills", title: "Skills and qualifications", icon: "checkCircle", detail: "What can be recorded on a staff profile. Qualifications can have an expiry date." },
  { id: "templates", title: "Event templates", icon: "layers", detail: "Staffing structures for recurring events, offered when creating an event." },
  { id: "matching", title: "Matching", icon: "sparkle", detail: "How Generate roster chooses between people who can all work a position." },
  { id: "pay", title: "Pay and award", icon: "chart", detail: "Pay fortnight, public holidays and award rates for the wage estimates." },
];

export default async function SettingsPage() {
  await requireAdmin();
  let data: AppData;
  try {
    data = await getData();
  } catch (err) {
    return <LoadError message={errorMessage(err)} />;
  }
  const body: Record<string, React.ReactNode> = {
    "task-types": <TaskTypesEditor taskTypes={data.taskTypes} skills={data.skills} />,
    skills: <SkillsEditor skills={data.skills} />,
    templates: <TemplatesEditor templates={data.templates} />,
    matching: <MatchingForm matching={data.settings.matching} />,
    pay: <PaySettingsForm key={JSON.stringify(data.settings)} settings={data.settings} />,
  };

  return (
    <>
      <PageHeader description="The lists and rules behind rostering. The built-in defaults work as they are; change them when your venue needs to. Each section saves on its own." />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-20">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-fg-2 hover:bg-surface-3 hover:text-fg">
                  <Icon name={s.icon} size={15} className="text-muted" />
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {SECTIONS.map((s) => (
            <Card key={s.id}>
              <div id={s.id} className="scroll-mt-20">
                <CardHeader title={s.title} description={s.detail} />
              </div>
              <div className="p-4">{body[s.id]}</div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
