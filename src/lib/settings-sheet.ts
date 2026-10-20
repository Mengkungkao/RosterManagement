import { type PaySettings, parseSettingsRows, settingsToRows } from "./settings";
import { getStore, tabName } from "./store";

// The Settings tab is created the first time settings are saved; until then
// the defaults apply.
export async function readSettings(): Promise<PaySettings> {
  return parseSettingsRows((await getStore().read(tabName("settings"))).slice(1));
}

export async function saveSettings(settings: PaySettings): Promise<void> {
  await getStore().writeAll(tabName("settings"), settingsToRows(settings));
}
