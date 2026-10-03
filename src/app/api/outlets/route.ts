import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit, isAdmin } from "@/lib/audit";

// GET /api/outlets — list outlets (staff: only their assigned outlet)
export async function GET() {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAdmin(profile) && !profile.outlet_id) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  }

  const outlets = await prisma.outlet.findMany({
    where: {
      org_id: profile.org_id,
      ...(!isAdmin(profile) && profile.outlet_id ? { id: profile.outlet_id } : {}),
    },
    orderBy: { created_at: "asc" },
    include: { _count: { select: { employees: true } } },
  });

  return NextResponse.json(outlets, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
  });
}

// POST /api/outlets — create an outlet
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { name, overtime_rate, allowance_rate, overtime_unit } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const outlet = await prisma.outlet.create({
    data: {
      org_id: profile.org_id,
      name: name.trim(),
      overtime_rate: overtime_rate ?? 0,
      allowance_rate: allowance_rate ?? 0,
      overtime_unit: overtime_unit ?? "hour",
    },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Outlet",
    entity_id: outlet.id,
    field_changed: "created",
    old_value: null,
    new_value: `Outlet created: ${outlet.name}`,
    outlet_id: outlet.id,
  });

  return NextResponse.json(outlet, { status: 201 });
}
