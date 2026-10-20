import type { RosterStatus } from "@/lib/overview";
import { Badge, type Tone } from "../ui/Badge";
import type { IconName } from "../ui/Icon";

const LOOK: Record<RosterStatus["key"], [Tone, IconName]> = {
  draft: ["neutral", "circleDashed"],
  attention: ["warning", "alert"],
  ready: ["info", "checkCircle"],
  published: ["success", "send"],
};

export function StatusBadge({ status }: { status: RosterStatus }) {
  const [tone, icon] = LOOK[status.key];
  return (
    <Badge tone={tone} icon={icon} title={status.detail}>
      {status.label}
    </Badge>
  );
}
