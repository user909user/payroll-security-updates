import { NextResponse } from "next/server";
import { getAuthProfile } from "@/lib/audit";
import { shouldHideEmployeeMoney } from "@/lib/money-visibility";
import { prisma } from "@/lib/prisma";
import { computeEmployeePayroll, type PayrollBreakdown } from "@/lib/payroll-server";

function maskPayrollRow(row: PayrollBreakdown): PayrollBreakdown & { salary_masked: true } {
  return {
    ...row,
    base_pay: 0,
    overtime_pay: 0,
    allowance_pay: 0,
    total_pay: 0,
    total_salary: 0,
    salary_given: 0,
    previous_balance: 0,
    monthly_balance: 0,
    closing_balance: 0,
    overtime_rate_snapshot: 0,
    allowance_rate_snapshot: 0,
    extra_allowance: 0,
    salary_masked: true,
  };
}

// GET /api/employees/:id/overview?month=&year=
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const [computed, payments] = await Promise.all([
    computeEmployeePayroll(id, profile.org_id, month, year),
    prisma.salaryPayment.findMany({
      where: { employee_id: id },
      orderBy: { paid_at: "desc" },
      include: { created_by_profile: { select: { username: true } } },
    }),
  ]);

  if (!computed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hideMoney = shouldHideEmployeeMoney(profile, computed.employee.salary_hidden);
  const employee = hideMoney
    ? {
        ...computed.employee,
        monthly_salary: "0",
        overtime_rate: "0",
        salary_masked: true,
      }
    : { ...computed.employee, salary_masked: false };

  const payroll =
    hideMoney && computed.payroll ? maskPayrollRow(computed.payroll) : computed.payroll;

  const safePayments = hideMoney
    ? payments.map((p) => ({ ...p, amount: "0" }))
    : payments;

  return NextResponse.json(
    {
      employee,
      payroll,
      payments: safePayments,
      salary_masked: hideMoney,
      money_hidden: hideMoney,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=90",
      },
    }
  );
}
