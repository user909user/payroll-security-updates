import { redirect } from "next/navigation";
import { getAuthProfile } from "@/lib/audit";
import AppShell from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getAuthProfile();
  if (!profile) redirect("/login");

  return (
    <AppShell
      role={profile.role}
      username={profile.username}
      outletName={profile.outlet?.name ?? null}
      outletId={profile.outlet_id}
    >
      {children}
    </AppShell>
  );
}
