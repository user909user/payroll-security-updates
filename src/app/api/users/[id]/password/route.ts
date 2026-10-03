import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/users/:id/password — admin sets a user's password
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const password = String(body.password ?? "");

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const target = await prisma.profile.findFirst({
    where: { id, org_id: profile.org_id },
    select: { id: true, username: true, role: true, outlet_id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Own password is changed from Settings (requires current password)
  if (target.id === profile.id) {
    return NextResponse.json(
      { error: "Use Settings to change your own password." },
      { status: 400 }
    );
  }

  const supabaseAdmin = await createAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Profile",
    entity_id: id,
    field_changed: "password",
    old_value: null,
    new_value: `Password reset for ${target.username}`,
    highlighted: true,
    outlet_id: target.outlet_id,
  });

  return NextResponse.json({ success: true });
}
