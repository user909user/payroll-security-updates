import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";

// POST /api/settings/salary-adjustments/:id/undo — restore snapshot
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const adjustment = await prisma.salaryAdjustment.findFirst({
    where: { id, org_id: profile.org_id },
  });

  if (!adjustment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (adjustment.undone_at) {
    return NextResponse.json({ error: "Already undone" }, { status: 400 });
  }

  let snapshot: Array<{ id: string; monthly_salary: number }> = [];
  try {
    snapshot = JSON.parse(adjustment.snapshot) as Array<{ id: string; monthly_salary: number }>;
  } catch {
    return NextResponse.json({ error: "Invalid snapshot data" }, { status: 500 });
  }

  await prisma.$transaction(async (tx) => {
    for (const row of snapshot) {
      await tx.employee.updateMany({
        where: { id: row.id },
        data: { monthly_salary: row.monthly_salary },
      });
    }
    await tx.salaryAdjustment.update({
      where: { id },
      data: { undone_at: new Date() },
    });
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "SalaryAdjustment",
    entity_id: id,
    field_changed: "undo",
    old_value: null,
    new_value: `Undid salary adjustment (${snapshot.length} employee${snapshot.length === 1 ? "" : "s"} restored)`,
    highlighted: true,
    outlet_id: adjustment.outlet_id,
  });

  for (const row of snapshot) {
    await logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "Employee",
      entity_id: row.id,
      field_changed: "monthly_salary",
      old_value: null,
      new_value: String(row.monthly_salary),
      highlighted: true,
      outlet_id: adjustment.outlet_id,
    });
  }

  return NextResponse.json({ success: true });
}
