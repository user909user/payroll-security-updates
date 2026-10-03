import { NextResponse } from "next/server";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function kolkataNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

/**
 * POST /api/settings/overtime-rates/apply-month
 * Re-lock current month payroll OT using each employee's standing OT rate.
 * Does not change standing rates — use after Save when you want this month updated too.
 * Body: { outlet_id: string }
 */
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Only admin can apply overtime rates" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const outletId = String(body.outlet_id ?? "");
  if (!outletId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, org_id: profile.org_id },
    select: { id: true, name: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const employees = await prisma.employee.findMany({
    where: { outlet_id: outletId },
    select: { id: true, name: true, overtime_rate: true },
    orderBy: { name: "asc" },
  });
  if (employees.length === 0) {
    return NextResponse.json({ error: "No employees in this outlet" }, { status: 404 });
  }

  const now = kolkataNow();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const existing = await prisma.payrollSummary.findMany({
    where: {
      employee_id: { in: employees.map((e) => e.id) },
      month,
      year,
    },
    select: { employee_id: true, overtime_rate_snapshot: true },
  });
  const prevByEmp = new Map(
    existing.map((s) => [s.employee_id, Number(s.overtime_rate_snapshot)])
  );

  const rates = employees.map((e) => ({
    id: e.id,
    name: e.name,
    overtime_rate:
      prevByEmp.has(e.id) && Number.isFinite(prevByEmp.get(e.id)!)
        ? prevByEmp.get(e.id)!
        : Number(e.overtime_rate),
    standing_rate: Number(e.overtime_rate),
  }));

  let recalculated = 0;
  const lines: string[] = [];
  for (const row of rates) {
    const summary = await saveEmployeePayrollSummary(
      row.id,
      profile.org_id,
      month,
      year,
      { forceNewOtRate: true }
    );
    if (summary) {
      recalculated += 1;
      const applied = Number(summary.overtime_rate_snapshot);
      lines.push(`${row.name} ${row.overtime_rate} → ${applied}`);
    }
  }

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const details = `Applied standing OT rates to ${monthLabel}\n${lines.join("\n")}`;

  const adjustment = await prisma.overtimeRateAdjustment.create({
    data: {
      org_id: profile.org_id,
      outlet_id: outletId,
      snapshot: JSON.stringify({ kind: "apply_month", month, year, rates }),
      details,
      apply_month: month,
      apply_year: year,
      created_by: profile.id,
    },
    include: { creator: { select: { username: true } } },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "OvertimeRateAdjustment",
    entity_id: adjustment.id,
    field_changed: "apply_month",
    old_value: null,
    new_value: details.replace(/\n/g, "; "),
    highlighted: true,
    outlet_id: outletId,
  });

  return NextResponse.json(
    { adjustment, recalculated, apply_month: month, apply_year: year, lines },
    { status: 201 }
  );
}
