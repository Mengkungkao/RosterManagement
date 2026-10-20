import { redirect } from "next/navigation";

// Wages moved into Reports; keeps old links (and their fortnight) working.
export default async function WagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { fortnight } = await searchParams;
  redirect(`/admin/reports?tab=wages${typeof fortnight === "string" ? `&fortnight=${encodeURIComponent(fortnight)}` : ""}`);
}
