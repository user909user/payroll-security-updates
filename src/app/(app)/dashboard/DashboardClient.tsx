"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Building2, Users } from "lucide-react";
import Link from "next/link";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { swrKeys } from "@/lib/swr-config";
import { prefetchOutletData } from "@/lib/prefetch";

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

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function DashboardClient() {
  const { outlets, selectedOutletId, loading: outletsLoading } = useOutlets();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: me } = useSWR<{ role: string }>(swrKeys.me());
  const isAdmin = me?.role === "admin";

  const { data, isLoading, isValidating } = useSWR<{
    employees: Employee[];
    payroll: Record<string, PayrollData>;
  }>(
    selectedOutletId ? swrKeys.outletPayroll(selectedOutletId, month, year) : null
  );

  const employees = data?.employees ?? [];
  const payrollMap = data?.payroll ?? {};
  const showSkeleton = isLoading && !data;

  useEffect(() => {
    if (!selectedOutletId) return;
    prefetchOutletData(selectedOutletId, month, year);
  }, [selectedOutletId, month, year]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const visiblePayroll = Object.entries(payrollMap).filter(([id, p]) => {
    const emp = employees.find((e) => e.id === id);
    return !(emp?.salary_masked || p.salary_masked);
  });
  const totalPayroll = visiblePayroll.reduce((s, [, p]) => s + p.total_pay, 0);
  const totalGiven = visiblePayroll.reduce((s, [, p]) => s + p.salary_given, 0);
  const totalBalance = visiblePayroll.reduce((s, [, p]) => s + p.closing_balance, 0);
  const totalAdvances = visiblePayroll.reduce(
    (s, [, p]) => s + (p.closing_balance < 0 ? Math.abs(p.closing_balance) : 0),
    0
  );

  function money(emp: Employee, p: PayrollData | undefined, value: number) {
    if (emp.salary_masked || p?.salary_masked) return "—";
    return formatINR(value);
  }

  if (!me) {
    return (
      <div className="page-content flex items-center justify-center" style={{ padding: "6rem" }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-content staff-dashboard-page">
        <div className="staff-dashboard-shell">
          <div className="page-header">
            <div>
              <h1 className="page-title">Dashboard</h1>
              <p className="page-subtitle">Monthly attendance overview</p>
            </div>
          </div>

          <div className="staff-dashboard-month-nav" aria-label="Month navigation">
            <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <span className="staff-dashboard-month-label">
              {MONTHS[month - 1]} {year}
              {isValidating && data ? " …" : ""}
            </span>
            <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>

          {showSkeleton ? (
            <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
              <span className="spinner spinner-lg" />
            </div>
          ) : employees.length === 0 ? (
            <div className="empty-state staff-empty-state">
              <p className="empty-state__title">No employees in this outlet</p>
              <p className="empty-state__desc">Add employees to see attendance for the month.</p>
              <Link href="/employees" className="btn btn-primary mt-4">Add Employee</Link>
            </div>
          ) : (
            <div className="staff-payroll-list">
              {employees.map((emp) => {
                const p = payrollMap[emp.id];
                return (
                  <div key={emp.id} className="staff-payroll-card">
                    <div className="staff-payroll-card__header">
                      <div className="staff-payroll-card__avatar">{emp.name.charAt(0).toUpperCase()}</div>
                      <div className="staff-payroll-card__name">{emp.name}</div>
                    </div>

                    <div className="staff-payroll-card__section-label">Attendance</div>
                    <div className="staff-payroll-card__rows">
                      <div className="staff-payroll-card__row">
                        <span>Days Present</span>
                        <strong>{p?.days_present ?? 0}</strong>
                      </div>
                      <div className="staff-payroll-card__row">
                        <span>Half Days</span>
                        <strong>{p?.days_half ?? 0}</strong>
                      </div>
                      <div className="staff-payroll-card__row">
                        <span>Days Absent (incl. unmarked)</span>
                        <strong>{p?.days_absent ?? 0}</strong>
                      </div>
                      <div className="staff-payroll-card__row">
                        <span>Paid Leave</span>
                        <strong>{p?.paid_leave_days ?? emp.paid_leave_days} days</strong>
                      </div>
                      <div className="staff-payroll-card__row">
                        <span>Overtime Days</span>
                        <strong>{p?.overtime_total_units ?? 0}</strong>
                      </div>
                      <div className="staff-payroll-card__row">
                        <span>Payable Days</span>
                        <strong>{p?.payable_days ?? 0}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Monthly payroll overview & balance summary</p>
        </div>
        <div className="month-nav">
          <button className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <span className="month-nav__label">
            {MONTHS[month - 1]} {year}
            {isValidating && data ? " …" : ""}
          </span>
          <button className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {!outletsLoading && outlets.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Building2 size={32} strokeWidth={2} />
          </div>
          <p className="empty-state__title">No outlets configured</p>
          <p className="empty-state__desc">Create an outlet to start managing employees and payroll.</p>
          <Link href="/outlets" className="btn btn-primary mt-4">Add Outlet</Link>
        </div>
      )}

      {selectedOutletId && employees.length > 0 && (
        <>
          <div className="grid-4 mb-6">
            <div className="card-flat-blue">
              <div className="stat-card__label text-blue">Total Payroll</div>
              <div className="stat-card__value text-blue">{formatINR(totalPayroll)}</div>
              <div className="stat-card__sub">{MONTHS[month-1]} {year}</div>
            </div>
            <div className="card-flat-emerald">
              <div className="stat-card__label text-emerald">Total Given</div>
              <div className="stat-card__value text-emerald">{formatINR(totalGiven)}</div>
              <div className="stat-card__sub">Salary disbursed</div>
            </div>
            <div className="card-flat-amber">
              <div className="stat-card__label text-amber">Net Balance</div>
              <div className="stat-card__value text-amber">{formatINR(totalBalance)}</div>
              <div className="stat-card__sub">
                {totalBalance >= 0 ? "Owed to employees" : "Advance paid"}
              </div>
            </div>
            <div className="card-flat-rose">
              <div className="stat-card__label text-danger">Total Advances</div>
              <div className="stat-card__value text-danger">{formatINR(totalAdvances)}</div>
              <div className="stat-card__sub">Paid beyond earned</div>
            </div>
          </div>

          {showSkeleton ? (
            <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
              <span className="spinner spinner-lg" />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {employees.map((emp) => {
                const p = payrollMap[emp.id];
                const masked = Boolean(emp.salary_masked || p?.salary_masked);
                return (
                  <div key={emp.id} className="card">
                    <div className="card-header-row mb-4 pb-4 border-b">
                      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                        <div
                          style={{
                            width: "44px", height: "44px", borderRadius: "50%",
                            background: "var(--color-primary)", color: "#FFFBF8",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: "1.125rem", flexShrink: 0,
                          }}
                        >
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="font-bold text-lg truncate">
                            {emp.name}
                            {masked && (
                              <span className="badge badge-neutral" style={{ marginLeft: 8, fontSize: "0.65rem" }}>
                                Salary hidden
                              </span>
                            )}
                          </div>
                          <div className="text-secondary text-sm font-medium">
                            Monthly: {masked ? "—" : formatINR(Number(emp.monthly_salary))} · Paid Leave: {emp.paid_leave_days}d
                          </div>
                        </div>
                      </div>
                      <div className="card-header-row__actions">
                        <Link href={`/employees/${emp.id}`} className="btn btn-secondary btn-sm" prefetch>
                          View Details →
                        </Link>
                      </div>
                    </div>

                    {p ? (
                      masked ? (
                        <p className="text-secondary text-sm font-medium">Salary details hidden for this employee.</p>
                      ) : (
                      <div className="payroll-split" style={{ gap: "1.5rem" }}>
                        <div>
                          <div className="text-muted text-xs font-bold uppercase mb-2">Pay Breakdown</div>
                          <div className="payroll-line"><span className="text-secondary">Days Present</span><span className="font-bold">{p.days_present}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Half Days</span><span className="font-bold">{p.days_half}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Days Absent</span><span className="font-bold">{p.days_absent}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Public Holidays</span><span className="font-bold">{p.public_holidays ?? 0}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Paid Leave</span><span className="font-bold">{p.paid_leave_days}d</span></div>
                          <div className="payroll-line"><span className="text-secondary">Overtime Days</span><span className="font-bold">{p.overtime_total_units ?? 0}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Payable Days</span><span className="font-bold">{p.payable_days}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Base Pay</span><span className="payroll-line__amount">{money(emp, p, p.base_pay)}</span></div>
                          <div className="payroll-line">
                            <span className="text-secondary">
                              Overtime Pay
                              {p.overtime_total_units != null && p.overtime_rate_snapshot != null && (
                                <span className="text-muted"> ({p.overtime_total_units}×{Number(p.overtime_rate_snapshot)})</span>
                              )}
                            </span>
                            <span className="payroll-line__amount">{money(emp, p, p.overtime_pay)}</span>
                          </div>
                          <div className="payroll-line total divider"><span>Total Pay</span><span className="payroll-line__amount amount-positive">{money(emp, p, p.total_pay)}</span></div>
                          {(p.extra_allowance ?? 0) !== 0 && <div className="payroll-line"><span className="text-secondary">Extra Allowance</span><span className={`payroll-line__amount ${(p.extra_allowance ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>{money(emp, p, p.extra_allowance ?? 0)}</span></div>}
                        </div>
                        <div>
                          <div className="text-muted text-xs font-bold uppercase mb-2">Balance Summary</div>
                          <div className="payroll-line"><span className="text-secondary">Salary Given</span><span className="payroll-line__amount">{money(emp, p, p.salary_given)}</span></div>
                          <div className="payroll-line"><span className="text-secondary">Previous Balance</span><span className={`payroll-line__amount ${p.previous_balance >= 0 ? "" : "amount-negative"}`}>{money(emp, p, p.previous_balance)}</span></div>
                          <div className="payroll-line total divider"><span>Current Balance</span><span className={`payroll-line__amount ${p.closing_balance >= 0 ? "amount-positive" : "amount-negative"}`}>{money(emp, p, p.closing_balance)}</span></div>
                          <div style={{ marginTop: "1rem" }}>
                            {p.closing_balance > 0 && <span className="badge badge-warning">{formatINR(Math.abs(p.closing_balance))} Owed</span>}
                            {p.closing_balance < 0 && <span className="badge badge-danger">{formatINR(Math.abs(p.closing_balance))} Advance</span>}
                            {p.closing_balance === 0 && <span className="badge badge-success">Fully Settled</span>}
                          </div>
                        </div>
                      </div>
                      )
                    ) : (
                      <div className="text-secondary text-sm font-medium">No attendance data for this month.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedOutletId && employees.length === 0 && !showSkeleton && (
        <div className="empty-state">
          <div className="empty-state__icon"><Users size={32} strokeWidth={2} /></div>
          <p className="empty-state__title">No employees in this outlet</p>
          <p className="empty-state__desc">Add employees to start tracking attendance and calculating payroll.</p>
          <Link href="/employees" className="btn btn-primary mt-4">Add Employee</Link>
        </div>
      )}
    </div>
  );
}
