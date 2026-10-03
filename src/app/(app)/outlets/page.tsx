import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthProfile, isAdmin } from "@/lib/audit";
import OutletsClient from "./OutletsClient";

export const metadata: Metadata = { title: "Outlets" };

export default async function OutletsPage() {
  const profile = await getAuthProfile();
  if (!profile) redirect("/login");
  if (!isAdmin(profile)) redirect("/employees");
  return <OutletsClient />;
}
