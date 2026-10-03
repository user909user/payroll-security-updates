"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDay, getDaysInMonth, startOfMonth } from "date-fns";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { invalidatePayrollCaches, swrKeys } from "@/lib/swr-config";
import { prefetchOutletData } from "@/lib/prefetch";
import PaymentModal from "@/components/PaymentModal";

interface Employee {
  id: string;
  name: string;
  monthly_salary: string;
  paid_leave_days: number;
  salary_hidden?: boolean;
  salary_masked?: boolean;
}
interface PayrollData {
  days_present: number;
  days_absent: number;
  days_half: number;
  days_unmarked?: number;
  public_holidays?: number;
  paid_leave_days: number;
  payable_days: number;
  base_pay: number;
  overtime_pay: number;
  overtime_total_units: number;
  overtime_rate_snapshot: number;
  allowance_pay?: number;
  allowance_rate_snapshot?: number;
  extra_allowance?: number;
  total_pay: number;
  total_salary?: number;
  salary_given: number;
  previous_balance: number;
  monthly_balance: number;
  closing_balance: number;
  salary_masked?: boolean;
  narration?: string | null;
}
interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent" | "half" | "holiday";
  overtime_units: number | null;
  holiday_name?: string | null;
}
interface CurrentProfile {
  role: string;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

function isCurrentOrPreviousMonth(month: number, year: number, now = new Date()) {
  const requested = year * 12 + month - 1;
  const current = now.getFullYear() * 12 + now.getMonth();
  return requested === current || requested === current - 1;
}

export default function PayrollClient() {
  const { selectedOutletId } = useOutlets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [paymentFor, setPaymentFor] = useState<Employee | null>(null);
  const [attendanceForId, setAttendanceForId] = useState<string | null>(null);
  const [narrationDrafts, setNarrationDrafts] = useState<Record<string, string>>({});
  const [savingNarrationFor, setSavingNarrationFor] = useState<string | null>(null);
  const [savedNarrationFor, setSavedNarrationFor] = useState<string | null>(null);

  const { data, isLoading, isValidating, mutate } = useSWR<{
    employees: Employee[];
    payroll: Record<string, PayrollData>;
    money_hidden?: boolean;
  }>(
    selectedOutletId ? swrKeys.outletPayroll(selectedOutletId, month, year, "payroll") : null
  );

  const employees = data?.employees ?? [];
  const payrollMap = data?.payroll ?? {};
  const moneyHidden = Boolean(data?.money_hidden);
  const showSkeleton = isLoading && !data;
  const { data: me } = useSWR<CurrentProfile>(swrKeys.me());
  const staffPaymentMonthAllowed =
    me?.role !== "staff" || isCurrentOrPreviousMonth(month, year);
  const { data: attendance, isLoading: attendanceLoading } = useSWR<AttendanceRecord[]>(
    attendanceForId ? swrKeys.attendance(attendanceForId, month, year) : null
  );

  const attendanceByDay = new Map(
    (attendance ?? []).map((record) => [new Date(record.date).getUTCDate(), record])
  );
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const firstDay = getDay(startOfMonth(new Date(year, month - 1)));
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  function attendanceMark(record: AttendanceRecord | undefined) {
    if (!record) return "—";
    if (record.status === "holiday") return "PH";
    if (record.status === "absent") return "A";
    if (record.status === "half") return "H";
    return Number(record.overtime_units) > 0 ? "Ot" : "P";
  }

  useEffect(() => {
    if (!selectedOutletId) return;
    prefetchOutletData(selectedOutletId, month, year);
  }, [selectedOutletId, month, year]);

  async function refreshPayroll() {
    await mutate();
    if (selectedOutletId) await invalidatePayrollCaches(selectedOutletId);
  }

  async function finalizePayroll(emp: Employee) {
    await fetch(`/api/employees/${emp.id}/payroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year }),
    });
    await refreshPayroll();
  }

  async function saveNarration(employeeId: string, currentNarration: string | null | undefined) {
    const narrationKey = `${employeeId}-${year}-${month}`;
    const narration = narrationDrafts[narrationKey] ?? currentNarration ?? "";
    setSavingNarrationFor(narrationKey);
    setSavedNarrationFor(null);
    try {
      const response = await fetch(`/api/employees/${employeeId}/payroll/narration`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, narration }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(body.error || "Could not save narration.");
        return;
      }
      await mutate();
      setNarrationDrafts((drafts) => {
        const next = { ...drafts };
        delete next[narrationKey];
        return next;
      });
      setSavedNarrationFor(narrationKey);
    } finally {
      setSavingNarrationFor(null);
    }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Monthly salary breakdown and payments</p>
        </div>
        <div className="month-nav">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="month-nav__label font-semibold">
            {MONTHS[month-1]} {year}
            {isValidating && data ? " …" : ""}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {showSkeleton ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No employees in this outlet</p>
          <p className="empty-state__desc">Add employees to view payroll.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {employees.map((emp) => {
            const p = payrollMap[emp.id];
            const hideMoney = moneyHidden || Boolean(emp.salary_masked || p?.salary_masked);

            const allowancePay = p?.allowance_pay ?? 0;
            const allowanceRate = p?.allowance_rate_snapshot ?? 0;
            const extraAllowance = p?.extra_allowance ?? 0;
            const totalSalary = p?.total_salary ?? ((p?.total_pay ?? 0) + allowancePay + extraAllowance);
            const markedAbsent = (p?.days_absent ?? 0) - (p?.days_unmarked ?? 0);
            const prevAdvance = (p?.previous_balance ?? 0) < 0 ? Math.abs(p.previous_balance) : 0;
            const prevOutstanding = (p?.previous_balance ?? 0) > 0 ? p.previous_balance : 0;
            const narrationKey = `${emp.id}-${year}-${month}`;

            return (
              <div key={emp.id} className="card">
                {/* Employee header */}
                <div className="card-header-row" style={{ marginBottom: "1.25rem" }}>
                  <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                    <div style={{
                      width: "42px", height: "42px", borderRadius: "50%",
                      background: "var(--color-primary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, color: "#fff", fontSize: "1.0625rem", flexShrink: 0,
                    }}>
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-semibold truncate" style={{ fontSize: "1.0625rem" }}>
                        {emp.name}
                      </div>
                      {!hideMoney && (
                        <div className="text-muted text-sm">
                          Monthly: {formatINR(Number(emp.monthly_salary))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="card-header-row__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm font-bold"
                      onClick={() => setAttendanceForId((current) => current === emp.id ? null : emp.id)}
                      aria-expanded={attendanceForId === emp.id}
                    >
                      {attendanceForId === emp.id ? "Hide Attendance" : "View Attendance"}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm font-bold"
                      onClick={() => setPaymentFor(emp)}
                      disabled={!staffPaymentMonthAllowed}
                      title={!staffPaymentMonthAllowed ? "Staff can record payments only for the current or previous month" : undefined}
                    >
                      + SALARY GIVEN / ADVANCE
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => finalizePayroll(emp)} title="Save/finalize payroll summary">
                      Save Summary
                    </button>
                  </div>
                </div>

                {attendanceForId === emp.id && (
                  <section className="payroll-attendance attendance-board mb-6" aria-label={`${MONTHS[month - 1]} ${year} attendance for ${emp.name}`}>
                    <div className="attendance-board__month payroll-attendance__header">
                      <div>
                        <h3 className="attendance-board__title">{MONTHS[month - 1]} <span className="attendance-board__year">{year}</span></h3>
                        <p className="payroll-attendance__subtitle">Read-only attendance for {emp.name}</p>
                      </div>
                      {attendanceLoading && <span className="spinner" />}
                    </div>
                    <div className="attendance-weekbar">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span className="attendance-weekday" key={day}>{day}</span>)}
                    </div>
                    <div className="attendance-grid payroll-attendance__grid">
                      {Array.from({ length: startOffset }).map((_, index) => <span key={`empty-${index}`} className="attendance-day attendance-day--empty" aria-hidden="true" />)}
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                        const record = attendanceByDay.get(day);
                        const mark = attendanceMark(record);
                        const statusClass = record?.status === "present" && Number(record.overtime_units) > 0
                          ? "ot"
                          : record?.status ?? "unmarked";
                        return (
                          <span
                            key={day}
                            className={`attendance-day ${statusClass}`}
                            title={record?.status === "holiday" ? record.holiday_name || "Public holiday" : record?.status || "Unmarked"}
                          >
                            <small className="attendance-day__date">{day}</small>
                            <strong className="attendance-day__mark">{mark}</strong>
                          </span>
                        );
                      })}
                    </div>
                    <div className="attendance-board__legend payroll-attendance__legend" aria-label="Attendance legend">
                      <span><i className="attendance-swatch attendance-swatch--unmarked" />Unmarked</span>
                      <span><i className="attendance-swatch attendance-swatch--present" />Present</span>
                      <span><i className="attendance-swatch attendance-swatch--absent" />Absent</span>
                      <span><i className="attendance-swatch attendance-swatch--ot" />Present + overtime</span>
                      <span><i className="attendance-swatch attendance-swatch--half" />Half day</span>
                      <span><i className="attendance-swatch attendance-swatch--holiday" />Public holiday</span>
                    </div>
                  </section>
                )}

                {p ? (
                  <>
                  <div className="payroll-split">
                    {/* Attendance / days — always visible */}
                    <div>
                      <div className="text-muted text-xs font-semibold mb-3" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {hideMoney ? "Attendance" : "Pay Breakdown"}
                      </div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Days Present</span><span>{p.days_present}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Half Days</span><span>{p.days_half}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Days Absent</span><span>{Math.max(0, markedAbsent)}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Unmarked Days</span><span>{p.days_unmarked ?? 0}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Public Holidays</span><span>{p.public_holidays ?? 0}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Paid Leave</span><span>{p.paid_leave_days} days</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Overtime Days</span><span>{p.overtime_total_units ?? 0}</span></div>
                      <div className="payroll-line"><span className="text-secondary text-sm">Payable Days</span><span>{p.payable_days}</span></div>
                      {!hideMoney && (
                        <>
                          <div className="payroll-line"><span className="text-secondary text-sm">Base Pay</span><span className="payroll-line__amount">{formatINR(p.base_pay)}</span></div>
                          <div className="payroll-line">
                            <span className="text-secondary text-sm">
                              Overtime Pay
                              <span className="text-muted"> ({p.overtime_total_units}×{Number(p.overtime_rate_snapshot)})</span>
                            </span>
                            <span className="payroll-line__amount">{formatINR(p.overtime_pay)}</span>
                          </div>
                          <div className="payroll-line">
                            <span className="text-secondary text-sm">
                              Allowance
                              {allowanceRate > 0 && <span className="text-muted"> ({Math.max(0, 30 - p.days_absent - (p.public_holidays ?? 0))}×{allowanceRate})</span>}
                            </span>
                            <span className="payroll-line__amount">{formatINR(allowancePay)}</span>
                          </div>
                          {extraAllowance !== 0 && (
                            <div className="payroll-line">
                              <span className="text-secondary text-sm">Extra Allowance</span>
                              <span className={`payroll-line__amount ${extraAllowance < 0 ? "amount-negative" : "amount-positive"}`}>{formatINR(extraAllowance)}</span>
                            </div>
                          )}
                          <div className="payroll-line total divider">
                            <span>Total Salary</span>
                            <span className="payroll-line__amount amount-positive">{formatINR(totalSalary)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Balance — admin only */}
                    {!hideMoney && (
                    <div>
                      <div className="text-muted text-xs font-semibold mb-3" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Balance
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">TOTAL PAY</span>
                        <span className="payroll-line__amount">{formatINR(p.total_pay)}</span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">+ ALLOWANCE</span>
                        <span className="payroll-line__amount">{formatINR(allowancePay)}</span>
                      </div>
                      {extraAllowance !== 0 && (
                        <div className="payroll-line">
                          <span className="text-secondary text-sm">EXTRA ALLOWANCE</span>
                          <span className={`payroll-line__amount ${extraAllowance < 0 ? "amount-negative" : "amount-positive"}`}>{formatINR(extraAllowance)}</span>
                        </div>
                      )}
                      <div className="payroll-line total">
                        <span className="text-primary font-bold">TOTAL SALARY</span>
                        <span className="payroll-line__amount amount-positive font-bold">{formatINR(totalSalary)}</span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">- ADVANCE (this month)</span>
                        <span className="payroll-line__amount amount-negative">-{formatINR(p.salary_given)}</span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">- PREV ADVANCE</span>
                        <span className="payroll-line__amount amount-negative">-{formatINR(prevAdvance)}</span>
                      </div>
                      <div className="payroll-line">
                        <span className="text-secondary text-sm">+ PREV OUTSTANDING</span>
                        <span className="payroll-line__amount amount-positive">+{formatINR(prevOutstanding)}</span>
                      </div>
                      <div className="payroll-line total divider">
                        <span>FINAL BALANCE</span>
                        <span className={`payroll-line__amount ${p.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>
                          {formatINR(p.closing_balance)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5" style={{ marginTop: "1rem" }}>
                        <div className="payroll-line">
                          <span className="text-secondary text-sm font-bold">SALARY GIVEN</span>
                          <span className="payroll-line__amount font-extrabold">{formatINR(p.salary_given)}</span>
                        </div>
                        <div className="payroll-line total">
                          <span className="text-primary font-bold">CLOSING BALANCE</span>
                          <span className={`payroll-line__amount font-bold ${p.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>
                            {formatINR(p.closing_balance)}
                          </span>
                        </div>
                        <div>
                          {p.closing_balance > 0 && <span className="badge badge-warning">{formatINR(Math.abs(p.closing_balance))} owed to employee</span>}
                          {p.closing_balance < 0 && <span className="badge badge-danger">{formatINR(Math.abs(p.closing_balance))} advance remaining</span>}
                          {p.closing_balance === 0 && <span className="badge badge-success">Fully settled</span>}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                  <div className="payroll-narration mt-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <label className="font-bold text-sm" htmlFor={`payroll-narration-${emp.id}`}>Narration</label>
                      {savedNarrationFor === narrationKey && <span className="text-xs amount-positive font-bold">Saved</span>}
                    </div>
                    <textarea
                      id={`payroll-narration-${emp.id}`}
                      className="form-input"
                      rows={3}
                      maxLength={2000}
                      value={narrationDrafts[narrationKey] ?? p.narration ?? ""}
                      onChange={(event) => {
                        setNarrationDrafts((drafts) => ({ ...drafts, [narrationKey]: event.target.value }));
                        if (savedNarrationFor === narrationKey) setSavedNarrationFor(null);
                      }}
                      placeholder="Write a note for this employee’s payroll month…"
                      style={{ resize: "vertical", width: "100%" }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm mt-3"
                      disabled={savingNarrationFor === narrationKey}
                      onClick={() => void saveNarration(emp.id, p.narration)}
                    >
                      {savingNarrationFor === narrationKey ? "Saving…" : "Save Narration"}
                    </button>
                  </div>
                  </>
                ) : (
                  <div className="text-muted text-sm">No attendance data for this month. Mark attendance first.</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payment modal */}
      {paymentFor && (
        <PaymentModal
          employee={paymentFor}
          month={month} year={year}
          onClose={() => setPaymentFor(null)}
          onSuccess={refreshPayroll}
        />
      )}
    </div>
  );
}
