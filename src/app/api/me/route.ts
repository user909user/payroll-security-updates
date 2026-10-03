import { NextResponse } from "next/server";
import { getAuthProfile } from "@/lib/audit";

// GET /api/me — current profile (role + outlet lock)
export async function GET() {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    id: profile.id,
    username: profile.username,
    role: profile.role,
    outlet_id: profile.outlet_id,
    outlet: profile.outlet
      ? { id: profile.outlet.id, name: profile.outlet.name }
      : null,
  });
}
