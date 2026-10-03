import { NextResponse } from "next/server";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

type RateRow = { id: string; name: string; overtime_rate: number };

function formatRateLine(name: string, from: number, to: number) {
  return `${name} ${from} → ${to}`;
}

// GET /api/settings/overtime-rates?outlet_id= — recent OT rate changes (admin)
export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const outletId = searchParams.get("outlet_id");
  if (!outletId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, org_id: profile.org_id },
    select: { id: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const rows = await prisma.overtimeRateAdjustment.findMany({
    where: { org_id: profile.org_id, outlet_id: outletId },
    orderBy: { created_at: "desc" },
    take: 20,
    include: { creator: { select: { username: true } } },
  });

  return NextResponse.json(rows);
}

/**
 * POST /api/settings/overtime-rates
 * Batch-update employee OT rates for an outlet.
 * Body: { outlet_id, rates: [{ employee_id, overtime_rate }], apply_current_month?: boolean }
 */
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Only admin can set overtime rates" }, { status: 403 });
  }

  const body = await request.json();
  const outletId = String(body.outlet_id ?? "");
  const applyCurrentMonth = Boolean(body.apply_current_month);
  const ratesInput = Array.isArray(body.rates) ? body.rates : null;

  // Legacy single-employee payload support
  const legacyEmployeeId = body.employee_id ? String(body.employee_id) : null;
  const legacyRate =
    body.overtime_rate !== undefined ? Number(body.overtime_rate) : null;

  if (!outletId && !legacyEmployeeId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }

  let employees = await prisma.employee.findMany({
    where: outletId
      ? { outlet_id: outletId, outlet: { org_id: profile.org_id } }
      : { id: legacyEmployeeId!, outlet: { org_id: profile.org_id } },
    select: { id: true, name: true, overtime_rate: true, outlet_id: true },
    orderBy: { name: "asc" },
  });

  if (employees.length === 0) {
    return NextResponse.json({ error: "No employees found" }, { status: 404 });
  }

  const resolvedOutletId = outletId || employees[0].outlet_id;

  const nextById = new Map<string, number>();
  if (ratesInput) {
    for (const row of ratesInput) {
      const id = String(row.employee_id ?? row.id ?? "");
      const rate = Number(row.overtime_rate);
      if (!id || !Number.isFinite(rate) || rate < 0) {
        return NextResponse.json(
          { error: "Each rate must be a valid number ≥ 0" },
          { status: 400 }
        );
      }
      nextById.set(id, rate);
    }
  } else if (legacyEmployeeId != null && legacyRate != null) {
    if (!Number.isFinite(legacyRate) || legacyRate < 0) {
      return NextResponse.json({ error: "Enter a valid overtime rate (≥ 0)" }, { status: 400 });
    }
    nextById.set(legacyEmployeeId, legacyRate);
  } else {
    return NextResponse.json({ error: "rates array is required" }, { status: 400 });
  }

  const changes: Array<{ id: string; name: string; from: number; to: number }> = [];
  const snapshot: RateRow[] = [];

  for (const emp of employees) {
    const from = Number(emp.overtime_rate);
    snapshot.push({ id: emp.id, name: emp.name, overtime_rate: from });
    if (!nextById.has(emp.id)) continue;
    const to = nextById.get(emp.id)!;
    if (from !== to) {
      changes.push({ id: emp.id, name: emp.name, from, to });
    }
  }

  if (changes.length === 0) {
    return NextResponse.json({ error: "No OT rate changes to save" }, { status: 400 });
  }

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const applyMonth = applyCurrentMonth ? currentMonth : null;
  const applyYear = applyCurrentMonth ? currentYear : null;

  const detailLines = changes.map((c) => formatRateLine(c.name, c.from, c.to));
  const details = detailLines.join("\n");

  // Save alone = standing rates going forward. Freeze current month at the
  // pre-change OT rate so live payroll does not pick up the new rate until
  // "Apply … current month" is used.
  if (!applyCurrentMonth) {
    for (const c of changes) {
      await saveEmployeePayrollSummary(
        c.id,
        profile.org_id,
        currentMonth,
        currentYear,
        { forceNewOtRate: false }
      );
    }
  }

  await prisma.$transaction(
    changes.map((c) =>
      prisma.employee.update({
        where: { id: c.id },
        data: { overtime_rate: c.to },
      })
    )
  );

  const adjustment = await prisma.overtimeRateAdjustment.create({
    data: {
      org_id: profile.org_id,
      outlet_id: resolvedOutletId,
      snapshot: JSON.stringify(snapshot),
      details,
      apply_month: applyMonth,
      apply_year: applyYear,
      created_by: profile.id,
    },
    include: { creator: { select: { username: true } } },
  });

  let recalculated = 0;
  if (applyMonth && applyYear) {
    for (const c of changes) {
      const summary = await saveEmployeePayrollSummary(
        c.id,
        profile.org_id,
        applyMonth,
        applyYear,
        { forceNewOtRate: true }
      );
      if (summary) recalculated += 1;
    }
  }

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "OvertimeRateAdjustment",
    entity_id: adjustment.id,
    field_changed: "apply",
    old_value: null,
    new_value:
      `${detailLines.join("; ")}` +
      (applyMonth && applyYear
        ? ` · applied to ${applyMonth}/${applyYear}`
        : " · standing rates only"),
    highlighted: true,
    outlet_id: resolvedOutletId,
  });

  return NextResponse.json(
    {
      adjustment,
      changes,
      recalculated,
      apply_month: applyMonth,
      apply_year: applyYear,
    },
    { status: 201 }
  );
}
