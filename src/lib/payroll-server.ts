import { prisma } from "@/lib/prisma";
import { calculateBalance, calculatePayroll, roundRupee } from "@/lib/payroll";

export type PayrollBreakdown = {
  employee_id: string;
  month: number;
  year: number;
  days_present: number;
  days_absent: number;
  days_half: number;
  days_unmarked: number;
  public_holidays: number;
  paid_leave_days: number;
  payable_days: number;
  base_pay: number;
  overtime_total_units: number;
  overtime_rate_snapshot: number;
  overtime_pay: number;
  allowance_rate_snapshot: number;
  allowance_pay: number;
  extra_allowance: number;
  narration: string | null;
  total_pay: number;
  total_salary: number;
  salary_given: number;
  previous_balance: number;
  monthly_balance: number;
  closing_balance: number;
  generated_at: Date;
};

type EmployeeWithOt = {
  id: string;
  monthly_salary: { toString(): string };
  paid_leave_days: number;
  salary_hidden?: boolean;
  overtime_rate?: { toString(): string } | null;
  allowance_rate?: { toString(): string } | null;
  outlet: { overtime_rate: { toString(): string }; allowance_rate: { toString(): string } };
};

type AttendanceRow = {
  employee_id: string;
  date: Date;
  status: string;
  overtime_units: unknown;
};

type PaymentRow = {
  employee_id?: string;
  amount: unknown;
  type?: string | null;
};

type SummaryRow = {
  employee_id: string;
  closing_balance: unknown;
  generated_at: Date;
  overtime_rate_snapshot?: unknown;
  allowance_rate_snapshot?: unknown;
  extra_allowance?: unknown;
  narration?: string | null;
};

function prevMonthYear(month: number, year: number) {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return { prevMonth, prevYear };
}

function monthRange(year: number, month: number) {
  return {
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0, 23, 59, 59),
  };
}

/** Net salary given = salary payments − repayments */
export function netSalaryGiven(payments: PaymentRow[]) {
  return payments.reduce((sum, p) => {
    const amount = Number(p.amount);
    if (p.type === "repayment") return sum - amount;
    return sum + amount;
  }, 0);
}

/** Per-employee OT rate (₹/day); falls back to outlet rate if unset. */
export function resolveOvertimeRate(employee: EmployeeWithOt): number {
  if (employee.overtime_rate != null) {
    const n = Number(employee.overtime_rate);
    if (Number.isFinite(n)) return n;
  }
  return Number(employee.outlet.overtime_rate) || 0;
}

/** Per-employee Allowance rate (₹/day); falls back to outlet rate if unset. */
export function resolveAllowanceRate(employee: EmployeeWithOt): number {
  if (employee.allowance_rate != null) {
    const n = Number(employee.allowance_rate);
    if (Number.isFinite(n)) return n;
  }
  return Number(employee.outlet.allowance_rate) || 0;
}

/**
 * Unmarked days (no attendance row) count as absent for the fixed 30-day month.
 * Present / half / absent only from marked records; unmarked fills the rest of 30.
 *
 * OT rate: employee standing rate (Settings). If a payroll summary already locked a
 * rate for the month, reuse that snapshot unless `forceNewOtRate` is set.
 */
export function buildPayrollBreakdown(
  employee: EmployeeWithOt,
  month: number,
  year: number,
  attendance: AttendanceRow[],
  payments: PaymentRow[],
  prevSummary: SummaryRow | undefined,
  existingSummary: SummaryRow | undefined,
  publicHolidays: Array<{ date: Date }> = [],
  options?: {
    forceNewOtRate?: boolean;
    overtimeRateOverride?: number;
    forceNewAllowanceRate?: boolean;
    allowanceRateOverride?: number;
    extraAllowanceOverride?: number;
  }
): PayrollBreakdown {
  const holidayDates = new Set(publicHolidays.map((holiday) => holiday.date.toISOString().slice(0, 10)));
  const activeAttendance = attendance.filter((row) => !holidayDates.has(row.date.toISOString().slice(0, 10)));
  const days_present = activeAttendance.filter((r) => r.status === "present").length;
  const days_half = activeAttendance.filter((r) => r.status === "half").length;
  const markedAbsent = activeAttendance.filter((r) => r.status === "absent").length;
  const public_holidays = holidayDates.size;
  const markedDays = days_present + days_half + markedAbsent + public_holidays;
  const days_unmarked = Math.max(0, 30 - markedDays);
  const days_absent = markedAbsent + days_unmarked;

  const overtime_total_units = activeAttendance.filter(
    (r) =>
      r.status === "present" &&
      r.overtime_units != null &&
      Number(r.overtime_units) > 0
  ).length;
  const salary_given = roundRupee(netSalaryGiven(payments));
  const previous_balance = prevSummary ? roundRupee(Number(prevSummary.closing_balance)) : 0;

  const override =
    options?.overtimeRateOverride != null && Number.isFinite(Number(options.overtimeRateOverride))
      ? Number(options.overtimeRateOverride)
      : null;
  const currentRate = override != null ? override : resolveOvertimeRate(employee);
  const locked =
    override == null &&
    !options?.forceNewOtRate &&
    existingSummary?.overtime_rate_snapshot != null &&
    Number(existingSummary.overtime_rate_snapshot) >= 0
      ? Number(existingSummary.overtime_rate_snapshot)
      : null;
  const overtime_rate = locked != null && Number.isFinite(locked) ? locked : currentRate;
  const allowanceOverride =
    options?.allowanceRateOverride != null &&
    Number.isFinite(Number(options.allowanceRateOverride))
      ? Number(options.allowanceRateOverride)
      : null;
  const currentAllowanceRate =
    allowanceOverride != null ? allowanceOverride : resolveAllowanceRate(employee);
  const lockedAllowanceRate =
    allowanceOverride == null &&
    !options?.forceNewAllowanceRate &&
    existingSummary?.allowance_rate_snapshot != null &&
    Number(existingSummary.allowance_rate_snapshot) >= 0
      ? Number(existingSummary.allowance_rate_snapshot)
      : null;
  const allowance_rate =
    lockedAllowanceRate != null && Number.isFinite(lockedAllowanceRate)
      ? lockedAllowanceRate
      : currentAllowanceRate;

  const calculated = calculatePayroll({
    monthly_salary: employee.monthly_salary,
    paid_leave_days: employee.paid_leave_days,
    days_absent,
    public_holidays,
    days_half,
    days_present,
    overtime_total_units,
    overtime_rate,
    allowance_rate,
  });
  const extra_allowance = roundRupee(
    options?.extraAllowanceOverride != null &&
    Number.isFinite(Number(options.extraAllowanceOverride))
      ? Number(options.extraAllowanceOverride)
      : Number(existingSummary?.extra_allowance ?? 0)
  );
  const total_salary = roundRupee(calculated.total_salary + extra_allowance);

  const { monthly_balance, closing_balance } = calculateBalance(
    total_salary,
    salary_given,
    previous_balance
  );

  return {
    employee_id: employee.id,
    month,
    year,
    days_present,
    days_absent,
    days_half,
    days_unmarked,
    public_holidays,
    paid_leave_days: employee.paid_leave_days,
    base_pay: calculated.base_pay,
    overtime_total_units,
    overtime_rate_snapshot: overtime_rate,
    overtime_pay: calculated.overtime_pay,
    allowance_rate_snapshot: allowance_rate,
    allowance_pay: calculated.allowance_pay,
    extra_allowance,
    narration: existingSummary?.narration ?? null,
    total_pay: calculated.total_pay,
    total_salary,
    salary_given,
    previous_balance,
    monthly_balance,
    closing_balance,
    payable_days: calculated.payable_days,
    generated_at: existingSummary?.generated_at ?? new Date(),
  };
}

export async function computeOutletPayroll(
  outletId: string,
  orgId: string,
  month: number,
  year: number,
  options?: { includeHidden?: boolean; forceNewOtRate?: boolean }
) {
  const { startDate, endDate } = monthRange(year, month);
  const { prevMonth, prevYear } = prevMonthYear(month, year);
  const includeHidden = options?.includeHidden ?? true;

  const [outlet, employees] = await Promise.all([
    prisma.outlet.findFirst({
      where: { id: outletId, org_id: orgId },
      select: { id: true, overtime_rate: true, allowance_rate: true },
    }),
    prisma.employee.findMany({
      where: {
        outlet_id: outletId,
        outlet: { org_id: orgId },
        ...(includeHidden ? {} : { salary_hidden: false }),
      },
      select: {
        id: true,
        name: true,
        monthly_salary: true,
        paid_leave_days: true,
        salary_hidden: true,
        overtime_rate: true,
        allowance_rate: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!outlet) return null;

  if (employees.length === 0) {
    return { employees: [], payroll: {} as Record<string, PayrollBreakdown> };
  }

  const employeeIds = employees.map((e) => e.id);

  const [attendance, payments, summaries, prevSummaries, publicHolidays] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employee_id: { in: employeeIds }, date: { gte: startDate, lte: endDate } },
      select: { employee_id: true, date: true, status: true, overtime_units: true },
    }),
    prisma.salaryPayment.findMany({
      where: { employee_id: { in: employeeIds }, month, year },
      select: { employee_id: true, amount: true, type: true },
    }),
    prisma.payrollSummary.findMany({
      where: { employee_id: { in: employeeIds }, month, year },
      select: {
        employee_id: true,
        closing_balance: true,
        generated_at: true,
        overtime_rate_snapshot: true,
        allowance_rate_snapshot: true,
        extra_allowance: true,
        narration: true,
      },
    }),
    prisma.payrollSummary.findMany({
      where: { employee_id: { in: employeeIds }, month: prevMonth, year: prevYear },
      select: { employee_id: true, closing_balance: true, generated_at: true },
    }),
    prisma.publicHoliday.findMany({
      where: { outlet_id: outletId, date: { gte: startDate, lte: endDate } },
      select: { date: true },
    }),
  ]);

  const attendanceByEmployee = groupBy(attendance, (r) => r.employee_id);
  const paymentsByEmployee = groupBy(payments, (r) => r.employee_id);
  const summaryByEmployee = new Map(summaries.map((s) => [s.employee_id, s]));
  const prevSummaryByEmployee = new Map(prevSummaries.map((s) => [s.employee_id, s]));
  const outletRate = { overtime_rate: outlet.overtime_rate, allowance_rate: outlet.allowance_rate };

  const payroll: Record<string, PayrollBreakdown> = {};
  for (const employee of employees) {
    payroll[employee.id] = buildPayrollBreakdown(
      { ...employee, outlet: outletRate },
      month,
      year,
      attendanceByEmployee.get(employee.id) ?? [],
      paymentsByEmployee.get(employee.id) ?? [],
      prevSummaryByEmployee.get(employee.id),
      summaryByEmployee.get(employee.id),
      publicHolidays,
      { forceNewOtRate: options?.forceNewOtRate }
    );
  }

  return { employees, payroll };
}

export async function computeEmployeePayroll(
  employeeId: string,
  orgId: string,
  month: number,
  year: number,
  options?: {
    forceNewOtRate?: boolean;
    overtimeRateOverride?: number;
    forceNewAllowanceRate?: boolean;
    allowanceRateOverride?: number;
    extraAllowanceOverride?: number;
  }
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, outlet: { org_id: orgId } },
    include: {
      outlet: { select: { name: true, overtime_rate: true, allowance_rate: true, overtime_unit: true } },
    },
  });
  if (!employee) return null;

  const { startDate, endDate } = monthRange(year, month);
  const { prevMonth, prevYear } = prevMonthYear(month, year);

  const [attendance, payments, existing, prevSummary, publicHolidays] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { employee_id: employeeId, date: { gte: startDate, lte: endDate } },
      select: { employee_id: true, date: true, status: true, overtime_units: true },
    }),
    prisma.salaryPayment.findMany({
      where: { employee_id: employeeId, month, year },
      select: { employee_id: true, amount: true, type: true },
    }),
    prisma.payrollSummary.findUnique({
      where: { employee_id_month_year: { employee_id: employeeId, month, year } },
      select: {
        employee_id: true,
        closing_balance: true,
        generated_at: true,
        overtime_rate_snapshot: true,
        allowance_rate_snapshot: true,
        extra_allowance: true,
        narration: true,
      },
    }),
    prisma.payrollSummary.findUnique({
      where: {
        employee_id_month_year: {
          employee_id: employeeId,
          month: prevMonth,
          year: prevYear,
        },
      },
      select: { employee_id: true, closing_balance: true, generated_at: true },
    }),
    prisma.publicHoliday.findMany({
      where: { outlet_id: employee.outlet_id, date: { gte: startDate, lte: endDate } },
      select: { date: true },
    }),
  ]);

  return {
    employee,
    payroll: buildPayrollBreakdown(
      employee,
      month,
      year,
      attendance,
      payments,
      prevSummary ?? undefined,
      existing ?? undefined,
      publicHolidays,
      options
    ),
  };
}

/** Upsert payroll summary for an employee/month (used after OT rate change). */
export async function saveEmployeePayrollSummary(
  employeeId: string,
  orgId: string,
  month: number,
  year: number,
  options?: {
    forceNewOtRate?: boolean;
    overtimeRateOverride?: number;
    forceNewAllowanceRate?: boolean;
    allowanceRateOverride?: number;
    extraAllowanceOverride?: number;
  }
) {
  const computed = await computeEmployeePayroll(employeeId, orgId, month, year, options);
  if (!computed) return null;
  const p = computed.payroll;

  return prisma.payrollSummary.upsert({
    where: { employee_id_month_year: { employee_id: employeeId, month, year } },
    create: {
      employee_id: employeeId,
      month,
      year,
      days_present: p.days_present,
      days_absent: p.days_absent,
      days_half: p.days_half,
      paid_leave_days: p.paid_leave_days,
      base_pay: p.base_pay,
      overtime_total_units: p.overtime_total_units,
      overtime_rate_snapshot: p.overtime_rate_snapshot,
      overtime_pay: p.overtime_pay,
      allowance_rate_snapshot: p.allowance_rate_snapshot,
      allowance_pay: p.allowance_pay,
      extra_allowance: p.extra_allowance,
      total_pay: p.total_pay,
      salary_given: p.salary_given,
      previous_balance: p.previous_balance,
      monthly_balance: p.monthly_balance,
      closing_balance: p.closing_balance,
    },
    update: {
      days_present: p.days_present,
      days_absent: p.days_absent,
      days_half: p.days_half,
      paid_leave_days: p.paid_leave_days,
      base_pay: p.base_pay,
      overtime_total_units: p.overtime_total_units,
      overtime_rate_snapshot: p.overtime_rate_snapshot,
      overtime_pay: p.overtime_pay,
      allowance_rate_snapshot: p.allowance_rate_snapshot,
      allowance_pay: p.allowance_pay,
      extra_allowance: p.extra_allowance,
      total_pay: p.total_pay,
      salary_given: p.salary_given,
      previous_balance: p.previous_balance,
      monthly_balance: p.monthly_balance,
      closing_balance: p.closing_balance,
      generated_at: new Date(),
    },
  });
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
