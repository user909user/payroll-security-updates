import { NextResponse } from "next/server";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// POST /api/settings/allowance-rates/apply-month
// Recalculate current-month payroll with saved standing allowance rates.
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Only admin can apply allowance rates" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const outletId = String(body.outlet_id ?? "");
  if (!outletId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, org_id: profile.org_id },
    select: { id: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const employees = await prisma.employee.findMany({
    where: { outlet_id: outletId },
    select: { id: true, name: true, allowance_rate: true },
    orderBy: { name: "asc" },
  });
  if (!employees.length) {
    return NextResponse.json({ error: "No employees in this outlet" }, { status: 404 });
  }

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const existing = await prisma.payrollSummary.findMany({
    where: { employee_id: { in: employees.map((e) => e.id) }, month, year },
    select: { employee_id: true, allowance_rate_snapshot: true },
  });
  const previousByEmployee = new Map(
    existing.map((summary) => [summary.employee_id, Number(summary.allowance_rate_snapshot)])
  );

  const lines: string[] = [];
  let recalculated = 0;
  for (const employee of employees) {
    const previous = previousByEmployee.get(employee.id) ?? Number(employee.allowance_rate);
    const summary = await saveEmployeePayrollSummary(employee.id, profile.org_id, month, year, {
      forceNewAllowanceRate: true,
    });
    if (summary) {
      recalculated += 1;
      lines.push(`${employee.name} ${previous} → ${Number(summary.allowance_rate_snapshot)}`);
    }
  }

  const details = `Applied standing allowance rates to ${MONTHS[month - 1]} ${year}: ${lines.join("; ")}`;
  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "AllowanceRateAdjustment",
    entity_id: outletId,
    field_changed: "apply_month",
    old_value: null,
    new_value: details,
    highlighted: true,
    outlet_id: outletId,
  });

  return NextResponse.json({ recalculated, month, year, lines }, { status: 201 });
}
