import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthProfile, isAdmin } from "@/lib/audit";
import UsersClient from "./UsersClient";

export const metadata: Metadata = { title: "User Management" };

export default async function UsersPage() {
  const profile = await getAuthProfile();
  if (!profile) redirect("/login");
  if (!isAdmin(profile)) redirect("/employees");
  return <UsersClient />;
}
