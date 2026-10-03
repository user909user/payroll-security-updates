import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";

// PATCH /api/outlets/:id — update outlet settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.outlet.findFirst({
    where: { id, org_id: profile.org_id },
  });
  if (!existing) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const updated = await prisma.outlet.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.overtime_rate !== undefined && { overtime_rate: body.overtime_rate }),
      ...(body.allowance_rate !== undefined && { allowance_rate: body.allowance_rate }),
      ...(body.overtime_unit !== undefined && { overtime_unit: body.overtime_unit }),
    },
  });

  // Audit each changed field
  const fields: Array<keyof typeof body> = ["name", "overtime_rate", "allowance_rate", "overtime_unit"];
  for (const field of fields) {
    if (body[field] !== undefined && String(body[field]) !== String(existing[field as keyof typeof existing])) {
      await logAudit({
        org_id: profile.org_id,
        user_id: profile.id,
        entity_type: "Outlet",
        entity_id: id,
        field_changed: String(field),
        old_value: String(existing[field as keyof typeof existing]),
        new_value: String(body[field]),
        outlet_id: id,
      });
    }
  }

  return NextResponse.json(updated);
}

// GET /api/outlets/:id
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const outlet = await prisma.outlet.findFirst({
    where: { id, org_id: profile.org_id },
    include: { _count: { select: { employees: true } } },
  });
  if (!outlet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(outlet);
}

// DELETE /api/outlets/:id — admin only; employees cascade, staff unassigned
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.outlet.findFirst({
    where: { id, org_id: profile.org_id },
    include: { _count: { select: { employees: true, profiles: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  await prisma.outlet.delete({ where: { id } });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Outlet",
    entity_id: id,
    field_changed: "deleted",
    old_value: existing.name,
    new_value: `${existing._count.employees} employees removed`,
    highlighted: true,
    outlet_id: null,
  });

  return NextResponse.json({ success: true });
}
