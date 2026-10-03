import { NextResponse } from "next/server";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveEmployeePayrollSummary } from "@/lib/payroll-server";

function currentKolkataMonth() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// GET /api/settings/extra-allowance?outlet_id=...
export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const outletId = new URL(request.url).searchParams.get("outlet_id");
  if (!outletId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }
  const { month, year } = currentKolkataMonth();
  const employees = await prisma.employee.findMany({
    where: { outlet_id: outletId, outlet: { org_id: profile.org_id } },
    select: {
      id: true,
      name: true,
      payroll_summaries: {
        where: { month, year },
        select: { extra_allowance: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    month,
    year,
    employees: employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      extra_allowance: Number(employee.payroll_summaries[0]?.extra_allowance ?? 0),
    })),
  });
}

// POST /api/settings/extra-allowance
// Set one employee's one-time positive bonus or negative deduction this month.
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) {
    return NextResponse.json({ error: "Only admin can set extra allowance" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const outletId = String(body.outlet_id ?? "");
  const employeeId = String(body.employee_id ?? "");
  const rawAmount = Number(body.amount);
  if (!outletId || !employeeId || body.amount === "" || !Number.isFinite(rawAmount)) {
    return NextResponse.json(
      { error: "outlet_id, employee_id, and a valid amount are required" },
      { status: 400 }
    );
  }
  const amount = Math.round(rawAmount);
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, outlet_id: outletId, outlet: { org_id: profile.org_id } },
    select: { id: true, name: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { month, year } = currentKolkataMonth();
  const existing = await prisma.payrollSummary.findUnique({
    where: { employee_id_month_year: { employee_id: employeeId, month, year } },
    select: { extra_allowance: true },
  });
  const previous = Number(existing?.extra_allowance ?? 0);
  const summary = await saveEmployeePayrollSummary(employeeId, profile.org_id, month, year, {
    extraAllowanceOverride: amount,
  });
  if (!summary) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "PayrollSummary",
    entity_id: summary.id,
    field_changed: "extra_allowance",
    old_value: String(previous),
    new_value: `${employee.name}: ${previous} → ${amount} (${month}/${year})`,
    highlighted: true,
    outlet_id: outletId,
  });

  return NextResponse.json({
    employee_id: employeeId,
    month,
    year,
    extra_allowance: amount,
  });
}
