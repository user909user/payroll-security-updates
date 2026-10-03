import { NextResponse } from "next/server";
import { canAccessOutlet, getAuthProfile } from "@/lib/audit";
import { canViewMoney, shouldHideEmployeeMoney } from "@/lib/money-visibility";
import { computeOutletPayroll, type PayrollBreakdown } from "@/lib/payroll-server";

function maskPayrollRow(row: PayrollBreakdown): PayrollBreakdown & { salary_masked: true } {
  return {
    ...row,
    base_pay: 0,
    overtime_pay: 0,
    allowance_pay: 0,
    extra_allowance: 0,
    total_pay: 0,
    total_salary: 0,
    salary_given: 0,
    previous_balance: 0,
    monthly_balance: 0,
    closing_balance: 0,
    overtime_rate_snapshot: 0,
    allowance_rate_snapshot: 0,
    salary_masked: true,
  };
}

// GET /api/outlets/:id/payroll?month=&year=&for=payroll
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!canAccessOutlet(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));
  const forPayrollPage = searchParams.get("for") === "payroll";

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const result = await computeOutletPayroll(id, profile.org_id, month, year, {
    includeHidden: true,
  });
  if (!result) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const employees = result.employees;

  const payroll: Record<string, PayrollBreakdown & { salary_masked: boolean }> = {};
  for (const emp of employees) {
    const row = result.payroll[emp.id];
    if (!row) continue;
    // Dashboard: staff never see amounts. Payroll: hide only if salary_hidden.
    const hide = !canViewMoney(profile) && (!forPayrollPage || shouldHideEmployeeMoney(profile, emp.salary_hidden));
    payroll[emp.id] = hide ? maskPayrollRow(row) : { ...row, salary_masked: false };
  }

  const safeEmployees = employees.map((e) => {
    const hide = !canViewMoney(profile) && (!forPayrollPage || shouldHideEmployeeMoney(profile, e.salary_hidden));
    if (hide) {
      return { ...e, monthly_salary: "0", overtime_rate: "0", salary_masked: true };
    }
    return { ...e, salary_masked: false };
  });

  return NextResponse.json(
    { employees: safeEmployees, payroll, money_hidden: false },
    { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=90" } }
  );
}
