type Decimal = number | { toString(): string };

export interface PayrollInput {
  monthly_salary: Decimal | number;
  paid_leave_days: number;
  days_absent: number;
  public_holidays?: number;
  days_half?: number;
  days_present?: number;
  overtime_total_units: Decimal | number;
  overtime_rate: Decimal | number;
  allowance_rate?: Decimal | number;
}

export interface PayrollResult {
  daily_rate: number;
  payable_days: number;
  base_pay: number;
  overtime_pay: number;
  allowance_pay: number;
  total_pay: number;
  total_salary: number;
}

/**
 * Calculate payroll:
 *
 *   daily_rate     = monthly_salary / 30
 *   payable_days   = 30 - days_absent - (0.5 × days_half) + paid_leave_days
 *   base_pay       = daily_rate * payable_days
 *   overtime_pay   = (OT days) × overtime_rate
 *   allowance_days = 30 - days_absent - public_holidays
 *   allowance_pay  = allowance_days × allowance_rate
 *   total_pay      = base_pay + overtime_pay
 *   total_salary   = total_pay + allowance_pay
 *
 * Special condition: If days_present === 0, base pay and overtime pay are 0.
 * Allowance still follows its absence-based formula.
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const salary = Number(input.monthly_salary);
  const paidLeave = Number(input.paid_leave_days);
  const absent = Number(input.days_absent);
  const publicHolidays = Number(input.public_holidays ?? 0);
  const half = Number(input.days_half ?? 0);
  const daysPresent = Number(input.days_present ?? 0);
  const otUnits = Number(input.overtime_total_units);
  const otRate = Number(input.overtime_rate);
  const allowRate = Number(input.allowance_rate);

  const daily_rate = salary / 30;
  const payable_days = 30 - absent - 0.5 * half + paidLeave;
  const allowance_days = Math.max(0, 30 - absent - publicHolidays);
  const allowance_pay = roundRupee(allowance_days * allowRate);

  if (daysPresent === 0) {
    return {
      daily_rate: roundRupee(daily_rate),
      payable_days,
      base_pay: 0,
      overtime_pay: 0,
      allowance_pay,
      total_pay: 0,
      total_salary: allowance_pay,
    };
  }

  const base_pay = roundRupee(daily_rate * payable_days);
  const overtime_pay = roundRupee(otUnits * otRate);
  const total_pay = roundRupee(base_pay + overtime_pay);
  const total_salary = roundRupee(total_pay + allowance_pay);

  return {
    daily_rate: roundRupee(daily_rate),
    payable_days,
    base_pay,
    overtime_pay,
    allowance_pay,
    total_pay,
    total_salary,
  };
}

/**
 * Calculate the closing balance for a month.
 *
 *   monthly_balance = total_salary - salary_given
 *   closing_balance = previous_balance + monthly_balance
 *
 * All money values are rounded to the nearest rupee.
 */
export function calculateBalance(
  total_salary: number,
  salary_given: number,
  previous_balance: number
) {
  const monthly_balance = roundRupee(roundRupee(total_salary) - roundRupee(salary_given));
  const closing_balance = roundRupee(roundRupee(previous_balance) + monthly_balance);
  return { monthly_balance, closing_balance };
}

export function roundRupee(n: number): number {
  return Math.round(Number(n) || 0);
}

/**
 * Format a number as Indian Rupee currency string (whole rupees).
 */
export function formatINR(amount: number): string {
  const rounded = roundRupee(amount);
  const abs = Math.abs(rounded);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  return rounded < 0 ? `-${formatted}` : formatted;
}
