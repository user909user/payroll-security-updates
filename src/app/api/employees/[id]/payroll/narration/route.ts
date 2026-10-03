import { NextResponse } from "next/server";
import { canAccessOutlet, getAuthProfile, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

// PUT /api/employees/:id/payroll/narration
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const month = Number(body.month);
  const year = Number(body.year);
  const narration = String(body.narration ?? "").trim();
  if (!month || month < 1 || month > 12 || !year) {
    return NextResponse.json({ error: "Valid month and year are required" }, { status: 400 });
  }
  if (narration.length > 2000) {
    return NextResponse.json({ error: "Narration must be 2,000 characters or fewer" }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id, outlet: { org_id: profile.org_id } },
    select: { id: true, name: true, outlet_id: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!canAccessOutlet(profile, employee.outlet_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.payrollSummary.findUnique({
    where: { employee_id_month_year: { employee_id: id, month, year } },
    select: { narration: true },
  });
  let summary = await saveEmployeePayrollSummary(id, profile.org_id, month, year);
  if (!summary) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  summary = await prisma.payrollSummary.update({
    where: { id: summary.id },
    data: { narration: narration || null },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "PayrollSummary",
    entity_id: summary.id,
    field_changed: "narration",
    old_value: existing?.narration ?? null,
    new_value: narration || null,
    outlet_id: employee.outlet_id,
  });

  return NextResponse.json({ narration: summary.narration });
}
