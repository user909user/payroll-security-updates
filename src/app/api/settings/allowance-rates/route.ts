import { NextResponse } from "next/server";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

// POST /api/settings/allowance-rates
// Save per-employee standing allowance rates without changing the current month.
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Only admin can set allowance rates" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const outletId = String(body.outlet_id ?? "");
  const ratesInput = Array.isArray(body.rates) ? body.rates : null;
  if (!outletId || !ratesInput) {
    return NextResponse.json({ error: "outlet_id and rates are required" }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({
    where: { outlet_id: outletId, outlet: { org_id: profile.org_id } },
    select: { id: true, name: true, allowance_rate: true },
    orderBy: { name: "asc" },
  });
  if (!employees.length) {
    return NextResponse.json({ error: "No employees found" }, { status: 404 });
  }

  const nextById = new Map<string, number>();
  for (const row of ratesInput) {
    const id = String(row.employee_id ?? "");
    const rate = Number(row.allowance_rate);
    if (!id || !Number.isFinite(rate) || rate < 0) {
      return NextResponse.json(
        { error: "Each allowance rate must be a valid number ≥ 0" },
        { status: 400 }
      );
    }
    nextById.set(id, rate);
  }

  const changes = employees.flatMap((employee) => {
    const to = nextById.get(employee.id);
    const from = Number(employee.allowance_rate);
    return to != null && to !== from
      ? [{ id: employee.id, name: employee.name, from, to }]
      : [];
  });
  if (!changes.length) {
    return NextResponse.json({ error: "No allowance rate changes to save" }, { status: 400 });
  }

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Create/refresh summaries before changing standing rates so this month's
  // allowance snapshot remains on the prior rate until Apply is selected.
  for (const change of changes) {
    await saveEmployeePayrollSummary(change.id, profile.org_id, month, year);
  }

  await prisma.$transaction(
    changes.map((change) =>
      prisma.employee.update({
        where: { id: change.id },
        data: { allowance_rate: change.to },
      })
    )
  );

  const details = changes.map((c) => `${c.name} ${c.from} → ${c.to}`).join("; ");
  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "AllowanceRateAdjustment",
    entity_id: outletId,
    field_changed: "allowance_rate",
    old_value: null,
    new_value: `${details} · standing rates only`,
    highlighted: true,
    outlet_id: outletId,
  });

  return NextResponse.json({ changes }, { status: 201 });
}
