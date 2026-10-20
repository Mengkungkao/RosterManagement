import { cache } from "react";
import { loadAll } from "./config-sheet";

// Everything a page needs, read once per request: the layout (for the alert
// count) and the page share one Google Sheets read.
export const getData = cache(loadAll);
