import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/users/:id — reassign staff outlet (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const outlet_id = body.outlet_id === null || body.outlet_id === ""
    ? null
    : String(body.outlet_id ?? "");

  const target = await prisma.profile.findFirst({
    where: { id, org_id: profile.org_id },
    include: { outlet: { select: { name: true } } },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.role !== "staff") {
    return NextResponse.json(
      { error: "Only staff can be assigned to a single outlet" },
      { status: 400 }
    );
  }
  if (!outlet_id) {
    return NextResponse.json({ error: "outlet_id is required for staff" }, { status: 400 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outlet_id, org_id: profile.org_id },
    select: { id: true, name: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  if (target.outlet_id === outlet.id) {
    return NextResponse.json({
      id: target.id,
      outlet_id: target.outlet_id,
      outlet: target.outlet,
    });
  }

  const updated = await prisma.profile.update({
    where: { id },
    data: { outlet_id: outlet.id },
    include: { outlet: { select: { id: true, name: true } } },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Profile",
    entity_id: id,
    field_changed: "outlet_id",
    old_value: target.outlet?.name ?? target.outlet_id,
    new_value: outlet.name,
    outlet_id: outlet.id,
  });

  return NextResponse.json(updated);
}

// DELETE /api/users/:id — remove a user (admin only, cannot delete self)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === profile.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const target = await prisma.profile.findFirst({
    where: { id, org_id: profile.org_id },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const supabaseAdmin = await createAdminClient();
  try {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      console.warn("[deleteUser] Supabase auth warning:", authError.message);
    }
  } catch (err) {
    console.warn("[deleteUser] Supabase error:", err);
  }

  await prisma.profile.delete({ where: { id } });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Profile",
    entity_id: id,
    field_changed: "deleted",
    old_value: target.username,
    new_value: `${target.username} (${target.role})`,
    highlighted: true,
    outlet_id: target.outlet_id,
  });

  return NextResponse.json({ success: true });
}
