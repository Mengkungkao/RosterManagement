import type { sheets_v4 } from "googleapis";

export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

let client: Promise<sheets_v4.Sheets> | null = null;

// One client per server process: it keeps its access token between requests
// instead of signing in again for every read and write. googleapis is loaded
// on first use, so code paths that never touch Google (tests, local data
// mode) don't pay for it.
export function getSheetsClient(): Promise<sheets_v4.Sheets> {
  client ??= (async () => {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!email || !key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set");
    }
    const { google } = await import("googleapis");
    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return google.sheets({ version: "v4", auth });
  })().catch((err) => {
    client = null; // let the next request try again (e.g. after fixing the env)
    throw err;
  });
  return client;
}
