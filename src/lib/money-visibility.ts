import { isAdmin } from "@/lib/audit";

/** Admin always sees money. */
export function canViewMoney(profile: { role: string } | null | undefined) {
  return isAdmin(profile);
}

/**
 * Staff: hide ₹ only when admin marked this employee salary_hidden.
 * Admin: never hide.
 */
export function shouldHideEmployeeMoney(
  profile: { role: string } | null | undefined,
  salaryHidden?: boolean | null
) {
  if (canViewMoney(profile)) return false;
  return Boolean(salaryHidden);
}

const MONEY_FIELDS = new Set([
  "monthly_salary",
  "overtime_rate",
  "overtime_rate_snapshot",
  "allowance_rate",
  "allowance_rate_snapshot",
  "extra_allowance",
  "base_pay",
  "overtime_pay",
  "total_pay",
  "salary_given",
  "previous_balance",
  "monthly_balance",
  "closing_balance",
  "amount",
  "apply",
  "apply_month",
  "repayment",
]);

const MONEY_ENTITIES = new Set([
  "SalaryPayment",
  "SalaryAdjustment",
  "OvertimeRateAdjustment",
  "AllowanceRateAdjustment",
  "PayrollSummary",
]);

/** Redact audit log money details for staff responses. */
export function redactAuditMoney<T extends {
  entity_type: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
}>(log: T): T {
  const field = log.field_changed ?? "";
  const moneyRelated =
    MONEY_ENTITIES.has(log.entity_type) ||
    MONEY_FIELDS.has(field) ||
    /₹|salary|rupee|payment|overtime rate|ot rate/i.test(
      `${log.old_value ?? ""} ${log.new_value ?? ""}`
    );

  if (!moneyRelated) return log;

  return {
    ...log,
    old_value: log.old_value != null ? "[hidden]" : null,
    new_value: log.new_value != null ? "Money details hidden" : null,
  };
}
