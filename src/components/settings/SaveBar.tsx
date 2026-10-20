import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

// The save row at the bottom of a settings section.
export function SaveBar({
  label,
  dirty,
  saving,
  error,
  onSave,
  onReset,
  extra,
}: {
  label: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onReset?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      {error && (
        <Alert tone="danger" className="mb-3" role="alert">
          {error}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <span className="ml-auto text-xs text-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        {onReset && dirty && (
          <Button variant="ghost" onClick={onReset} disabled={saving}>
            Undo changes
          </Button>
        )}
        <Button variant="primary" icon="check" loading={saving} disabled={!dirty} onClick={onSave}>
          {label}
        </Button>
      </div>
    </div>
  );
}
