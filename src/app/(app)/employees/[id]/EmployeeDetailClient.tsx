"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getDaysInMonth } from "date-fns";
import { formatINR } from "@/lib/payroll";
import { swrKeys } from "@/lib/swr-config";

interface Employee {
  id: string;
  name: string;
  monthly_salary: string;
  overtime_rate?: string;
  paid_leave_days: number;
  salary_hidden?: boolean;
  salary_masked?: boolean;
  outlet: { name: string; overtime_rate: string; overtime_unit: string };
  created_at: string;
}

interface Payment {
  id: string;
  month: number;
  year: number;
  amount: string;
  type?: "salary" | "repayment";
  paid_at: string;
  created_by_profile?: { username: string };
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
  overtime_total_units?: number;
  overtime_rate_snapshot?: number;
  extra_allowance?: number;
  total_pay: number;
  salary_given: number;
  previous_balance: number;
  monthly_balance: number;
  closing_balance: number;
  salary_masked?: boolean;
}

interface AttendanceItem {
  id: string;
  date: string;
  status: "present" | "absent" | "half";
  overtime_units: number | null;
}

const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

export default function EmployeeDetailClient({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [view, setView] = useState<"summary" | "full">("summary");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading, isValidating } = useSWR<{
    employee: Employee;
    payroll: PayrollData;
    payments: Payment[];
    salary_masked?: boolean;
    money_hidden?: boolean;
  }>(swrKeys.employeeOverview(employeeId, month, year));

  const { data: attendanceData } = useSWR<AttendanceItem[]>(
    view === "full" ? swrKeys.attendance(employeeId, month, year) : null
  );

  const employee = data?.employee ?? null;
  const payroll = data?.payroll ?? null;
  const payments = data?.payments ?? [];
  const attendance = attendanceData ?? [];

  const recordsByDay = useMemo(() => {
    const map: Record<number, AttendanceItem> = {};
    attendance.forEach((r) => {
      map[new Date(r.date).getUTCDate()] = r;
    });
    return map;
  }, [attendance]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  if (isLoading && !employee) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "6rem" }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <p className="empty-state__title">Employee not found</p>
        </div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const fullPresent = attendance.filter((r) => r.status === "present").length;
  const fullHalf = attendance.filter((r) => r.status === "half").length;
  const fullAbsent = attendance.filter((r) => r.status === "absent").length;
  const masked = Boolean(
    data?.money_hidden ||
      data?.salary_masked ||
      employee.salary_masked ||
      payroll?.salary_masked
  );

  return (
    <div className="page-content animate-fade-in">
      <div className="mb-4">
        <Link href="/employees" className="btn btn-framed btn-sm">
          ← Back to Employees
        </Link>
      </div>

      <div className="card mb-6" style={{ padding: "1.75rem" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div
            style={{
              width: "56px", height: "56px", borderRadius: "50%",
              background: "var(--color-primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, color: "#fff", fontSize: "1.5rem", flexShrink: 0,
            }}
          >
            {employee.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="page-title">{employee.name}</h1>
            <p className="text-secondary text-sm">
              Outlet: <strong>{employee.outlet.name}</strong> · Joined:{" "}
              {new Date(employee.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className={`mt-6 pt-4 border-t ${masked ? "grid-2" : "grid-3"}`}>
          {!masked && (
            <div>
              <div className="text-muted text-xs uppercase font-semibold">Monthly Salary</div>
              <div className="text-xl font-bold mt-1">
                {formatINR(Number(employee.monthly_salary))}
              </div>
            </div>
          )}
          <div>
            <div className="text-muted text-xs uppercase font-semibold">Paid Leave Allowance</div>
            <div className="text-xl font-bold mt-1">{employee.paid_leave_days} days</div>
          </div>
          {!masked && (
            <div>
              <div className="text-muted text-xs uppercase font-semibold">OT Rate / Day</div>
              <div className="text-xl font-bold mt-1">
                {formatINR(Number(employee.overtime_rate ?? employee.outlet.overtime_rate))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-bold">Monthly Overview</h2>
        <div className="flex items-center gap-3 flex-wrap" style={{ width: "100%", maxWidth: "100%" }}>
          <div className="segmented" role="group" aria-label="View mode">
            <button type="button" className={`segmented__btn ${view === "summary" ? "active" : ""}`} onClick={() => setView("summary")} aria-pressed={view === "summary"}>Summary</button>
            <button type="button" className={`segmented__btn ${view === "full" ? "active" : ""}`} onClick={() => setView("full")} aria-pressed={view === "full"}>Full Month View</button>
          </div>
          <div className="month-nav" style={{ flex: "1 1 auto", justifyContent: "space-between" }}>
            <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={18} strokeWidth={2} /></button>
            <span className="month-nav__label font-semibold">{MONTHS[month-1]} {year}{isValidating && data ? " …" : ""}</span>
            <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month"><ChevronRight size={18} strokeWidth={2} /></button>
          </div>
        </div>
      </div>

      {view === "full" ? (
        <div className="mb-6 flex flex-col" style={{ gap: "1.5rem" }}>
          <div className="card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <div className="text-sm font-extrabold uppercase tracking-wide text-secondary">Daily Attendance</div>
              <div className="flex gap-2">
                <span className="badge badge-success">{fullPresent} Present</span>
                <span className="badge badge-warning">{fullHalf} Half</span>
                <span className="badge badge-danger">{fullAbsent} Absent</span>
                <span className="badge badge-neutral">{daysInMonth - fullPresent - fullHalf - fullAbsent} Unmarked and absent</span>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Day</th><th>Present / Absent</th><th>Overtime</th></tr>
                </thead>
                <tbody>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateObj = new Date(year, month - 1, day);
                    const rec = recordsByDay[day];
                    return (
                      <tr key={day}>
                        <td className="font-bold">{dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                        <td className="text-secondary">{dateObj.toLocaleDateString("en-IN", { weekday: "long" })}</td>
                        <td>
                          {rec ? (
                            <span className={`badge ${rec.status === "present" ? "badge-success" : rec.status === "half" ? "badge-warning" : "badge-danger"}`}>
                              {rec.status === "present" ? "Present" : rec.status === "half" ? "Half Day" : "Absent"}
                            </span>
                          ) : (
                            <span className="badge badge-neutral">Unmarked and absent</span>
                          )}
                        </td>
                        <td className={rec?.overtime_units != null && Number(rec.overtime_units) > 0 ? "amount-positive font-semibold" : "text-muted"}>
                          {rec?.overtime_units != null && Number(rec.overtime_units) > 0 ? "OT" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-flat-emerald">
            <div className="text-xs font-extrabold uppercase tracking-wide text-emerald mb-3">
              {masked ? "Month summary" : "Final Settlement"} · {MONTHS[month - 1]} {year}
            </div>
            {payroll ? (
              <div className={masked ? "" : "grid-2"}>
                <div>
                  <div className="payroll-line"><span className="text-secondary">Days Present</span><span className="font-bold">{payroll.days_present}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Half Days</span><span className="font-bold">{payroll.days_half}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Days Absent (incl. unmarked)</span><span className="font-bold">{payroll.days_absent}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Unmarked and absent</span><span className="font-bold">{payroll.days_unmarked ?? "—"}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Public Holidays</span><span className="font-bold">{payroll.public_holidays ?? 0}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Paid Leave</span><span className="font-bold">{payroll.paid_leave_days}d</span></div>
                  <div className="payroll-line"><span className="text-secondary">Overtime Days</span><span className="font-bold">{payroll.overtime_total_units ?? 0}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Payable Days</span><span className="font-bold">{payroll.payable_days}</span></div>
                  {!masked && (
                    <>
                      <div className="payroll-line"><span className="text-secondary">Base Pay</span><span className="payroll-line__amount">{formatINR(payroll.base_pay)}</span></div>
                      <div className="payroll-line">
                        <span className="text-secondary">
                          Overtime Pay
                          {payroll.overtime_total_units != null && payroll.overtime_rate_snapshot != null && (
                            <span className="text-muted"> ({payroll.overtime_total_units}×{Number(payroll.overtime_rate_snapshot)})</span>
                          )}
                        </span>
                        <span className="payroll-line__amount">{formatINR(payroll.overtime_pay)}</span>
                      </div>
                      <div className="payroll-line total divider"><span>Total Pay</span><span className="payroll-line__amount amount-positive">{formatINR(payroll.total_pay)}</span></div>
                      {(payroll.extra_allowance ?? 0) !== 0 && <div className="payroll-line"><span className="text-secondary">Extra Allowance</span><span className={`payroll-line__amount ${(payroll.extra_allowance ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>{formatINR(payroll.extra_allowance ?? 0)}</span></div>}
                    </>
                  )}
                </div>
                {!masked && (
                <div>
                  <div className="payroll-line"><span className="text-secondary">Salary Given</span><span className="payroll-line__amount">{formatINR(payroll.salary_given)}</span></div>
                  <div className="payroll-line"><span className="text-secondary">Previous Balance</span><span className={`payroll-line__amount ${payroll.previous_balance < 0 ? "amount-negative" : ""}`}>{formatINR(payroll.previous_balance)}</span></div>
                  <div className="payroll-line total divider"><span>Closing Balance</span><span className={`payroll-line__amount ${payroll.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>{formatINR(payroll.closing_balance)}</span></div>
                  <div className="mt-4">
                    {payroll.closing_balance > 0 && <span className="badge badge-warning">{formatINR(Math.abs(payroll.closing_balance))} owed to employee</span>}
                    {payroll.closing_balance < 0 && <span className="badge badge-danger">{formatINR(Math.abs(payroll.closing_balance))} advance paid</span>}
                    {payroll.closing_balance === 0 && <span className="badge badge-success">Fully settled</span>}
                  </div>
                </div>
                )}
              </div>
            ) : (
              <div className="text-secondary text-sm">No attendance data for this month. Mark attendance first.</div>
            )}
          </div>
        </div>
      ) : payroll ? (
          <div className="card mb-6">
            <div className={masked ? "" : "grid-2"} style={masked ? undefined : { gap: "2rem" }}>
              <div>
                <div className="text-muted text-xs font-semibold uppercase mb-3">
                  {masked ? "Attendance summary" : "Calculation Breakdown"}
                </div>
                <div className="payroll-line"><span className="text-secondary">Days Present</span><span className="font-semibold">{payroll.days_present}</span></div>
                <div className="payroll-line"><span className="text-secondary">Half Days</span><span className="font-semibold">{payroll.days_half}</span></div>
                <div className="payroll-line"><span className="text-secondary">Days Absent (incl. unmarked)</span><span className="font-semibold">{payroll.days_absent}</span></div>
                <div className="payroll-line"><span className="text-secondary">Unmarked and absent</span><span className="font-semibold">{payroll.days_unmarked ?? "—"}</span></div>
                <div className="payroll-line"><span className="text-secondary">Public Holidays</span><span className="font-semibold">{payroll.public_holidays ?? 0}</span></div>
                <div className="payroll-line"><span className="text-secondary">Paid Leave Days</span><span className="font-semibold">{payroll.paid_leave_days}</span></div>
                <div className="payroll-line"><span className="text-secondary">Overtime Days</span><span className="font-semibold">{payroll.overtime_total_units ?? 0}</span></div>
                <div className="payroll-line"><span className="text-secondary">Payable Days</span><span className="font-semibold">{payroll.payable_days}</span></div>
                {!masked && (
                  <>
                    <div className="payroll-line"><span className="text-secondary">Base Pay</span><span className="payroll-line__amount">{formatINR(payroll.base_pay)}</span></div>
                    <div className="payroll-line">
                      <span className="text-secondary">
                        Overtime Pay
                        {payroll.overtime_total_units != null && payroll.overtime_rate_snapshot != null && (
                          <span className="text-muted"> ({payroll.overtime_total_units}×{Number(payroll.overtime_rate_snapshot)})</span>
                        )}
                      </span>
                      <span className="payroll-line__amount">{formatINR(payroll.overtime_pay)}</span>
                    </div>
                    <div className="payroll-line total divider"><span>Total Pay</span><span className="payroll-line__amount amount-positive">{formatINR(payroll.total_pay)}</span></div>
                    {(payroll.extra_allowance ?? 0) !== 0 && <div className="payroll-line"><span className="text-secondary">Extra Allowance</span><span className={`payroll-line__amount ${(payroll.extra_allowance ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>{formatINR(payroll.extra_allowance ?? 0)}</span></div>}
                  </>
                )}
              </div>
              {!masked && (
              <div>
                <div className="text-muted text-xs font-semibold uppercase mb-3">Balance & Payments</div>
                <div className="payroll-line"><span className="text-secondary">Previous Balance</span><span className="payroll-line__amount">{formatINR(payroll.previous_balance)}</span></div>
                <div className="payroll-line"><span className="text-secondary">Current Month Total Pay</span><span className="payroll-line__amount">{formatINR(payroll.total_pay)}</span></div>
                <div className="payroll-line"><span className="text-secondary">Salary Given</span><span className="payroll-line__amount">{formatINR(payroll.salary_given)}</span></div>
                <div className="payroll-line total divider"><span>Closing Balance</span><span className={`payroll-line__amount ${payroll.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>{formatINR(payroll.closing_balance)}</span></div>
                <div className="mt-4">
                  <Link href={`/attendance?employee=${employee.id}`} className="btn btn-framed btn-sm">View / Edit Attendance Calendar →</Link>
                </div>
              </div>
              )}
              {masked && (
                <div className="mt-4">
                  <Link href={`/attendance?employee=${employee.id}`} className="btn btn-framed btn-sm">View / Edit Attendance Calendar →</Link>
                </div>
              )}
            </div>
          </div>
      ) : null}

      <h2 className="text-lg font-bold mb-4">Payment History</h2>
      {payments.length === 0 ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>No payments recorded yet for this employee.</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>For Month</th>
                {!masked && <th>Amount</th>}
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="text-secondary text-sm">{new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td>
                    <span className={`badge ${p.type === "repayment" ? "badge-warning" : "badge-accent"}`}>
                      {p.type === "repayment" ? "Repayment" : "Salary"}
                    </span>
                  </td>
                  <td>{MONTHS[p.month - 1]} {p.year}</td>
                  {!masked && (
                    <td className={`font-semibold ${p.type === "repayment" ? "amount-negative" : "amount-positive"}`}>
                      {p.type === "repayment" ? "−" : ""}{formatINR(Number(p.amount))}
                    </td>
                  )}
                  <td className="text-muted text-sm">{p.created_by_profile?.username ?? "Admin"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
