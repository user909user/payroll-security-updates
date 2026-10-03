import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/audit";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getAuthProfile();
  if (!profile) redirect("/login");
  return <SettingsClient />;
}
