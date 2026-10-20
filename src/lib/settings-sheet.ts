import { type PaySettings, parseSettingsRows, settingsToRows } from "./settings";
import { getStore, tabName, withLock } from "./store";

// The Settings tab is created the first time settings are saved; until then
// the defaults apply.
export async function readSettings(): Promise<PaySettings> {
  return parseSettingsRows((await getStore().read(tabName("settings"))).slice(1));
}

// Reads the current settings, applies `change` and saves, holding the tab's
// lock so pay and matching settings saved at once don't undo each other.
export async function updateSettings(change: (current: PaySettings) => PaySettings | string): Promise<string | null> {
  return withLock(tabName("settings"), async () => {
    const next = change(await readSettings());
    if (typeof next === "string") return next;
    await getStore().writeAll(tabName("settings"), settingsToRows(next));
    return null;
  });
}
