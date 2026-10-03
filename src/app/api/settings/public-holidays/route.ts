import { NextResponse } from "next/server";
import { canAccessOutlet, getAuthProfile, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function parseDate(value: unknown) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
}

export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const outletId = new URL(request.url).searchParams.get("outlet_id");
  if (!outletId) return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });

  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, org_id: profile.org_id },
    select: { id: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
  if (!canAccessOutlet(profile, outlet.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const holidays = await prisma.publicHoliday.findMany({
    where: { outlet_id: outletId, outlet: { org_id: profile.org_id } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(holidays);
}

export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const outletId = String(body.outlet_id ?? "");
  const date = parseDate(body.date);
  const name = String(body.name ?? "").trim() || null;
  if (!outletId || !date) return NextResponse.json({ error: "outlet_id and a valid date are required" }, { status: 400 });

  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, org_id: profile.org_id }, select: { id: true } });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
  if (!canAccessOutlet(profile, outlet.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const holiday = await prisma.publicHoliday.upsert({
    where: { outlet_id_date: { outlet_id: outletId, date } },
    create: { outlet_id: outletId, date, name },
    update: { name },
  });
  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "PublicHoliday",
    entity_id: holiday.id,
    field_changed: "date",
    old_value: null,
    new_value: `${date.toISOString().slice(0, 10)}${name ? ` · ${name}` : ""}`,
    outlet_id: outletId,
  });
  return NextResponse.json(holiday, { status: 201 });
}

export async function DELETE(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const holiday = await prisma.publicHoliday.findFirst({
    where: { id, outlet: { org_id: profile.org_id } },
    select: { id: true, outlet_id: true, date: true, name: true },
  });
  if (!holiday) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  if (!canAccessOutlet(profile, holiday.outlet_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.publicHoliday.delete({ where: { id } });
  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "PublicHoliday",
    entity_id: id,
    field_changed: "deleted",
    old_value: `${holiday.date.toISOString().slice(0, 10)}${holiday.name ? ` · ${holiday.name}` : ""}`,
    new_value: null,
    outlet_id: holiday.outlet_id,
  });
  return NextResponse.json({ success: true });
}
