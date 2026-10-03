"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/client";
import { invalidatePayrollCaches, invalidatePublicHolidayCaches, swrKeys } from "@/lib/swr-config";

interface Adjustment {
  id: string;
  scope: "employee" | "all";
  employee_id: string | null;
  mode: "percent" | "amount";
  value: string;
  created_at: string;
  undone_at: string | null;
  creator?: { username: string };
  details?: string;
  changes?: Array<{ id: string; name: string; from: number; to: number; label: string }>;
}

interface OtAdjustment {
  id: string;
  details: string;
  apply_month: number | null;
  apply_year: number | null;
  created_at: string;
  undone_at: string | null;
  creator?: { username: string };
}

interface OutletEmp {
  id: string;
  name: string;
  monthly_salary: string;
  overtime_rate?: string | number;
  allowance_rate?: string | number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatPlainSalary(n: number) {
  return Number.isInteger(n) ? String(n) : String(n);
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) {
        setError("Could not load your account. Sign in again and retry.");
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });
      if (verifyError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message || "Failed to update password.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Change password</h2>
      <p className="text-secondary text-sm mb-4">
        Update the password for your own login.
      </p>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 420 }}
      >
        {error && <div className="alert alert-danger">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            className="form-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            className="form-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            className="form-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
          {saving ? <><span className="spinner" />Updating…</> : "Update password"}
        </button>
      </form>
    </div>
  );
}

function SalaryFormulaCard() {
  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Salary & Balance Formula Reference</h2>
      <p className="text-secondary text-sm mb-4">
        Overview of how monthly payroll, allowance, overtime, and balances are computed.
      </p>
      <div className="flex flex-col gap-3 text-sm">
        <div className="p-3 bg-surface rounded-lg border">
          <div className="font-bold text-primary mb-1">1. Base Pay</div>
          <div className="text-secondary font-mono text-xs">Base Pay = (Monthly Salary / 30) × Payable Days</div>
          <div className="text-muted text-xs mt-1">Payable Days = 30 - Days Absent - (0.5 × Half Days) + Paid Leave Days</div>
          <div className="text-muted text-xs mt-1">Public holidays are marked paid days and are not counted as absent.</div>
        </div>
        <div className="p-3 bg-surface rounded-lg border">
          <div className="font-bold text-primary mb-1">2. Overtime & Allowance</div>
          <div className="text-secondary font-mono text-xs mb-1">Overtime Pay = Overtime Days × Daily OT Rate</div>
          <div className="text-secondary font-mono text-xs">Allowance = (30 - Absent Days - Public Holidays) × Daily Allowance Rate</div>
          <div className="text-muted text-xs mt-1">Absent Days include unmarked days. Public holidays are deducted separately.</div>
        </div>
        <div className="p-3 bg-surface rounded-lg border">
          <div className="font-bold text-primary mb-1">3. Total Salary</div>
          <div className="text-secondary font-mono text-xs mb-1">Total Salary = Base Pay + Overtime Pay + Allowance + Extra Allowance</div>
        </div>
        <div className="p-3 bg-surface rounded-lg border">
          <div className="font-bold text-primary mb-1">4. Balance Formula</div>
          <div className="text-secondary font-mono text-xs">
            Closing Balance = Total Salary - Advance (this month) - Prev Advance + Prev Outstanding
          </div>
        </div>
      </div>
    </div>
  );
}

function AdvanceAdjustmentCard({ outletId, outletName }: { outletId: string | null; outletName?: string }) {
  const { data, mutate } = useSWR<{
    month: number;
    year: number;
    employees: { id: string; name: string; advance_given: number }[];
  }>(
    outletId ? `/api/settings/advance-adjustments?outlet_id=${outletId}` : null
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const employees = data?.employees ?? [];

  function getVal(emp: { id: string; advance_given: number }) {
    if (drafts[emp.id] !== undefined) return drafts[emp.id];
    return String(emp.advance_given ?? 0);
  }

  async function handleSave() {
    if (!outletId || !employees.length) return;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const advances = employees.map((emp) => ({
        employee_id: emp.id,
        amount: Number(getVal(emp)) || 0,
      }));

      const res = await fetch("/api/settings/advance-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          month: data?.month,
          year: data?.year,
          advances,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to save advance adjustments.");
        return;
      }
      setDrafts({});
      setMessage(body.message || "Advance given amounts updated successfully.");
      void mutate();
      if (outletId) void invalidatePayrollCaches(outletId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Advance Adjustment</h2>
      <p className="text-secondary text-sm mb-4">
        {outletName
          ? `View and edit current month Advance Given values per employee for ${outletName}.`
          : "Select an outlet in the top bar."}
      </p>

      {error && <div className="alert alert-danger mb-4">{error}</div>}
      {message && <div className="alert alert-success mb-4">{message}</div>}

      {!outletId ? (
        <p className="text-muted text-sm">Select an outlet from the top bar.</p>
      ) : employees.length === 0 ? (
        <p className="text-muted text-sm">No employees in this outlet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2" style={{ maxWidth: 360 }}>
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between gap-3">
                <span className="font-bold text-sm truncate" style={{ flex: 1 }}>{emp.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-muted text-xs">₹</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className="form-input"
                    value={getVal(emp)}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                    style={{ width: 100, textAlign: "right", minHeight: 34, padding: "0.25rem 0.5rem" }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} />Saving…</> : "Save Advance Adjustments"}
          </button>
        </>
      )}
    </div>
  );
}

function AllowanceRateCard({
  outletId,
  outletName,
}: {
  outletId: string | null;
  outletName?: string;
}) {
  const { data: employees, mutate } = useSWR<OutletEmp[]>(
    outletId ? swrKeys.employees(outletId) : null
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const now = new Date();
  const monthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  function draftValue(employee: OutletEmp) {
    return drafts[employee.id] ?? String(employee.allowance_rate ?? 0);
  }

  async function saveRates() {
    if (!outletId || !employees?.length) return;
    setError("");
    setMessage("");
    const rates = employees.map((employee) => ({
      employee_id: employee.id,
      allowance_rate: Number(draftValue(employee)),
    }));
    const invalid = rates.find((rate) => !Number.isFinite(rate.allowance_rate) || rate.allowance_rate < 0);
    if (invalid) {
      setError(`Invalid allowance rate for ${employees.find((e) => e.id === invalid.employee_id)?.name ?? "employee"}.`);
      return;
    }
    if (!rates.some((rate) => Number(employees.find((e) => e.id === rate.employee_id)?.allowance_rate ?? 0) !== rate.allowance_rate)) {
      setError("Change at least one allowance rate before saving.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/settings/allowance-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: outletId, rates }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Failed to save allowance rates.");
        return;
      }
      setDrafts({});
      await mutate();
      void invalidatePayrollCaches(outletId);
      setMessage(`Saved standing allowance rates. ${monthLabel} remains unchanged until you apply them.`);
    } finally {
      setSaving(false);
    }
  }

  async function applyCurrentMonth() {
    if (!outletId || !employees?.length) return;
    setError("");
    setMessage("");
    if (employees.some((employee) => Number(draftValue(employee)) !== Number(employee.allowance_rate ?? 0))) {
      setError("Save your allowance rate changes first, then apply them to the current month.");
      return;
    }

    setApplying(true);
    try {
      const response = await fetch("/api/settings/allowance-rates/apply-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: outletId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Failed to apply allowance rates to the current month.");
        return;
      }
      void invalidatePayrollCaches(outletId);
      setMessage(`Applied saved allowance rates to ${monthLabel}.`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Allowance per day</h2>
      <p className="text-secondary text-sm mb-4">
        {outletName
          ? `Per employee · ${outletName}. Save the standing rate first, then apply it if this month should use it.`
          : "Select an outlet in the header."}
      </p>
      {error && <div className="alert alert-danger mb-4">{error}</div>}
      {message && <div className="alert alert-success mb-4">{message}</div>}
      {!outletId ? (
        <p className="text-muted text-sm">Select an outlet from the top bar.</p>
      ) : !employees?.length ? (
        <p className="text-muted text-sm">No employees in this outlet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2" style={{ width: "max-content", maxWidth: "100%" }}>
            {employees.map((employee) => (
              <div key={employee.id} className="flex items-center gap-3" style={{ minHeight: 36 }}>
                <span className="font-bold" style={{ minWidth: "7rem", maxWidth: "10rem" }} title={employee.name}>
                  {employee.name}
                </span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  className="form-input"
                  value={draftValue(employee)}
                  onChange={(event) => setDrafts((current) => ({ ...current, [employee.id]: event.target.value }))}
                  aria-label={`Allowance per day for ${employee.name}`}
                  style={{ width: 88, minHeight: 36, padding: "0.35rem 0.5rem", fontVariantNumeric: "tabular-nums", fontWeight: 700, textAlign: "right" }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || applying} onClick={() => void saveRates()}>
              {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} />Saving…</> : "Save"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving || applying} onClick={() => void applyCurrentMonth()}>
              {applying ? <><span className="spinner" style={{ width: 14, height: 14 }} />Applying…</> : "Apply new allowance rates for the current month"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ExtraAllowanceCard({
  outletId,
  outletName,
}: {
  outletId: string | null;
  outletName?: string;
}) {
  const { data, mutate } = useSWR<{
    month: number;
    year: number;
    employees: { id: string; name: string; extra_allowance: number }[];
  }>(outletId ? `/api/settings/extra-allowance?outlet_id=${outletId}` : null);
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const employees = data?.employees ?? [];
  const selectedEmployee = employees.find((employee) => employee.id === employeeId);

  function selectEmployee(id: string) {
    setEmployeeId(id);
    const employee = employees.find((item) => item.id === id);
    setAmount(String(employee?.extra_allowance ?? 0));
    setMessage("");
    setError("");
  }

  async function saveExtraAllowance(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const numericAmount = Number(amount);
    if (!outletId || !employeeId) {
      setError("Select an employee.");
      return;
    }
    if (amount.trim() === "" || !Number.isFinite(numericAmount)) {
      setError("Enter a valid positive or negative amount.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/settings/extra-allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: outletId, employee_id: employeeId, amount: numericAmount }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Failed to save extra allowance.");
        return;
      }
      await mutate();
      void invalidatePayrollCaches(outletId, employeeId);
      setAmount(String(body.extra_allowance));
      setMessage(
        `${selectedEmployee?.name ?? "Employee"}: ${formatINR(body.extra_allowance)} extra allowance saved for ${MONTHS[body.month - 1]} ${body.year}.`
      );
    } finally {
      setSaving(false);
    }
  }

  const options = employees.map((employee) => ({
    value: employee.id,
    label: `${employee.name} (${formatINR(employee.extra_allowance)})`,
  }));

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Extra allowance</h2>
      <p className="text-secondary text-sm mb-4">
        {outletName
          ? `One-time bonus or deduction for the current month · ${outletName}. Use a negative amount for a deduction.`
          : "Select an outlet in the header."}
      </p>
      <form onSubmit={(event) => void saveExtraAllowance(event)} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 420 }}>
        {error && <div className="alert alert-danger">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        <Dropdown
          value={employeeId}
          onChange={selectEmployee}
          options={options}
          label="Employee"
          placeholder={outletId ? "Select employee" : "Select outlet first"}
        />
        <div className="form-group">
          <label className="form-label" htmlFor="extra-allowance-amount">
            Amount (₹)
          </label>
          <input
            id="extra-allowance-amount"
            type="number"
            step={1}
            className="form-input"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Example: 1000 or -500"
            disabled={!employeeId}
          />
          <p className="form-hint">Positive adds a bonus. Negative deducts from this month’s salary.</p>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !employeeId} style={{ alignSelf: "flex-start" }}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} />Saving…</> : "Save extra allowance"}
        </button>
      </form>
    </div>
  );
}

function PublicHolidayCard({ outletId, outletName }: { outletId: string | null; outletName?: string }) {
  const { data: holidays, mutate } = useSWR<Array<{ id: string; date: string; name: string | null }>>(
    outletId ? `/api/settings/public-holidays?outlet_id=${outletId}` : null
  );
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function addHoliday(event: React.FormEvent) {
    event.preventDefault();
    if (!outletId || !date) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/settings/public-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: outletId, date, name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Failed to save public holiday.");
        return;
      }
      setDate("");
      setName("");
      await mutate();
      void invalidatePublicHolidayCaches(outletId);
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(id: string) {
    if (!outletId) return;
    const response = await fetch(`/api/settings/public-holidays?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Failed to remove public holiday.");
      return;
    }
    await mutate();
    void invalidatePublicHolidayCaches(outletId);
  }

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-bold mb-1">Public holidays</h2>
      <p className="text-secondary text-sm mb-4">
        {outletName
          ? `Dates set for ${outletName} appear as PH for every employee and remain paid days.`
          : "Select an outlet in the header."}
      </p>
      {error && <div className="alert alert-danger mb-4">{error}</div>}
      <form onSubmit={(event) => void addHoliday(event)} className="flex items-end gap-3 flex-wrap mb-4">
        <div className="form-group">
          <label className="form-label" htmlFor="public-holiday-date">Date</label>
          <input id="public-holiday-date" type="date" className="form-input" value={date} onChange={(event) => setDate(event.target.value)} required />
        </div>
        <div className="form-group" style={{ flex: "1 1 180px", maxWidth: 300 }}>
          <label className="form-label" htmlFor="public-holiday-name">Holiday name (optional)</label>
          <input id="public-holiday-name" className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Diwali" />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !outletId || !date}>
          {saving ? "Saving…" : "Add public holiday"}
        </button>
      </form>
      {!holidays?.length ? (
        <p className="text-muted text-sm">No public holidays set for this outlet.</p>
      ) : (
        <div className="flex flex-col gap-2" style={{ maxWidth: 520 }}>
          {holidays.map((holiday) => (
            <div key={holiday.id} className="flex items-center justify-between gap-3 p-3 bg-surface rounded-lg border">
              <div>
                <div className="font-bold text-sm">{new Date(holiday.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</div>
                {holiday.name && <div className="text-secondary text-xs">{holiday.name}</div>}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void removeHoliday(holiday.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsClient() {
  const { data: me } = useSWR<{ role: string }>(swrKeys.me());
  const isAdmin = me?.role === "admin";
  const { selectedOutletId, selectedOutlet } = useOutlets();
  const salaryOutletId = selectedOutletId;
  const otOutletId = selectedOutletId;

  const { data: adjustments, mutate } = useSWR<Adjustment[]>(
    isAdmin && salaryOutletId ? swrKeys.salaryAdjustments(salaryOutletId) : null
  );
  const { data: otAdjustments, mutate: mutateOtAdj } = useSWR<OtAdjustment[]>(
    isAdmin && otOutletId ? swrKeys.overtimeAdjustments(otOutletId) : null
  );

  const { data: employees } = useSWR<OutletEmp[]>(
    isAdmin && salaryOutletId ? swrKeys.employees(salaryOutletId) : null
  );
  const { data: otEmployees, mutate: mutateOtEmployees } = useSWR<OutletEmp[]>(
    isAdmin && otOutletId ? swrKeys.employees(otOutletId) : null
  );

  const [scope, setScope] = useState<"all" | "employee">("all");
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [otUndoing, setOtUndoing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [otDrafts, setOtDrafts] = useState<Record<string, string>>({});
  const [otSaving, setOtSaving] = useState(false);
  const [otApplyingMonth, setOtApplyingMonth] = useState(false);
  const [otMessage, setOtMessage] = useState("");
  const [otError, setOtError] = useState("");

  const now = new Date();
  const currentMonthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  useEffect(() => {
    setOtDrafts({});
    setOtMessage("");
    setOtError("");
  }, [otOutletId]);

  useEffect(() => {
    setEmployeeId("");
    setError("");
    setMessage("");
  }, [salaryOutletId]);

  const empOptions = useMemo(
    () =>
      (Array.isArray(employees) ? employees : []).map((e) => ({
        value: e.id,
        label: `${e.name} (${formatINR(Number(e.monthly_salary))})`,
      })),
    [employees]
  );

  const lastOtChange = otAdjustments?.[0] ?? null;

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!salaryOutletId) {
      setError("Select an outlet in the header.");
      return;
    }
    if (!value || !Number.isFinite(Number(value))) {
      setError("Enter a valid adjustment value.");
      return;
    }
    if (scope === "employee" && !employeeId) {
      setError("Select an employee.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/salary-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: salaryOutletId,
          scope,
          employee_id: scope === "employee" ? employeeId : undefined,
          mode,
          value: Number(value),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to apply adjustment");
        return;
      }
      setMessage("Salaries updated. You can undo from the history below.");
      setValue("");
      void mutate();
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo(id: string) {
    if (!confirm("Restore previous salaries from this adjustment?")) return;
    setUndoing(id);
    try {
      const res = await fetch(`/api/settings/salary-adjustments/${id}/undo`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Undo failed");
        return;
      }
      void mutate();
    } finally {
      setUndoing(null);
    }
  }

  function otDraftValue(emp: OutletEmp) {
    return otDrafts[emp.id] ?? String(emp.overtime_rate ?? "0");
  }

  function currentOt(emp: OutletEmp) {
    return Number(emp.overtime_rate ?? 0);
  }

  async function saveAllOtRates() {
    if (!otOutletId || !otEmployees?.length) return;
    setOtError("");
    setOtMessage("");

    const rates: Array<{ employee_id: string; overtime_rate: number }> = [];
    for (const emp of otEmployees) {
      const rate = Number(otDraftValue(emp));
      if (!Number.isFinite(rate) || rate < 0) {
        setOtError(`Invalid rate for ${emp.name}`);
        return;
      }
      rates.push({ employee_id: emp.id, overtime_rate: rate });
    }

    const changed = rates.some((r) => {
      const emp = otEmployees.find((e) => e.id === r.employee_id);
      return emp && currentOt(emp) !== r.overtime_rate;
    });
    if (!changed) {
      setOtError("Change at least one OT rate before saving.");
      return;
    }

    setOtSaving(true);
    setOtApplyingMonth(false);
    try {
      const res = await fetch("/api/settings/overtime-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: otOutletId,
          rates,
          apply_current_month: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtError(body.error || "Failed to save OT rates");
        return;
      }
      setOtDrafts({});
      void mutateOtEmployees();
      void mutateOtAdj();
      void invalidatePayrollCaches(otOutletId);
      const lines = Array.isArray(body.changes)
        ? body.changes.map((c: { name: string; from: number; to: number }) =>
            `${c.name} ${c.from} → ${c.to}`
          )
        : [];
      setOtMessage(
        `Saved standing OT rates (current month unchanged)\n${lines.join("\n")}\nYou can now apply these rates to ${currentMonthLabel}.`
      );
    } finally {
      setOtSaving(false);
    }
  }

  async function applyOtRatesToCurrentMonth() {
    if (!otOutletId || !otEmployees?.length) return;
    setOtError("");
    setOtMessage("");

    // If there are unsaved draft edits, save them first together with apply.
    const draftChanges = otEmployees.some(
      (emp) => Number(otDraftValue(emp)) !== currentOt(emp)
    );
    if (draftChanges) {
      setOtError("Save your OT rate changes first, then apply to the current month.");
      return;
    }

    setOtSaving(true);
    setOtApplyingMonth(true);
    try {
      const res = await fetch("/api/settings/overtime-rates/apply-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: otOutletId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtError(body.error || "Failed to apply OT rates to current month");
        return;
      }
      void mutateOtAdj();
      void invalidatePayrollCaches(otOutletId);
      const lines = Array.isArray(body.lines) ? body.lines : [];
      setOtMessage(
        `Applied standing OT rates to ${currentMonthLabel}\n${lines.join("\n")}`
      );
    } finally {
      setOtSaving(false);
      setOtApplyingMonth(false);
    }
  }

  async function handleOtUndo(id: string) {
    if (!confirm("Restore previous OT rates from this change?")) return;
    setOtUndoing(id);
    try {
      const res = await fetch(`/api/settings/overtime-rates/${id}/undo`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Undo failed");
        return;
      }
      void mutateOtAdj();
      void mutateOtEmployees();
      void invalidatePayrollCaches(otOutletId);
      setOtMessage("OT rates restored from last change.");
    } finally {
      setOtUndoing(null);
    }
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">
            {isAdmin
              ? "Account password, employee OT rates, and salary adjustments"
              : "Account password and public holidays for your outlet"}
          </p>
        </div>
      </div>

      <ChangePasswordCard />
      <PublicHolidayCard key={`holiday-${selectedOutletId}`} outletId={selectedOutletId} outletName={selectedOutlet?.name} />

      {isAdmin && (
        <>
          <SalaryFormulaCard />
          <AdvanceAdjustmentCard outletId={selectedOutletId} outletName={selectedOutlet?.name} />
          <ExtraAllowanceCard key={`extra-${selectedOutletId}`} outletId={selectedOutletId} outletName={selectedOutlet?.name} />
          <AllowanceRateCard key={selectedOutletId} outletId={selectedOutletId} outletName={selectedOutlet?.name} />
      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-1">Overtime rate</h2>
        <p className="text-secondary text-sm mb-4">
          {selectedOutlet
            ? `Per employee · ${selectedOutlet.name}. Save the new standing rate first, then Apply if this month should use it.`
            : "Select an outlet in the header"}
        </p>

        {otError && <div className="alert alert-danger mb-4">{otError}</div>}
        {otMessage && (
          <div className="alert alert-success mb-4" style={{ whiteSpace: "pre-line" }}>
            {otMessage}
          </div>
        )}

        {!otOutletId ? (
          <p className="text-muted text-sm">Select an outlet from the top bar.</p>
        ) : !otEmployees?.length ? (
          <p className="text-muted text-sm">No employees in this outlet.</p>
        ) : (
          <>
            <div
              className="mb-4"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "max-content",
                maxWidth: "100%",
              }}
            >
              {otEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3"
                  style={{ minHeight: 36 }}
                >
                  <span
                    className="font-bold"
                    style={{ minWidth: "7rem", maxWidth: "10rem" }}
                    title={emp.name}
                  >
                    {emp.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    className="form-input"
                    value={otDraftValue(emp)}
                    onChange={(e) =>
                      setOtDrafts((d) => ({ ...d, [emp.id]: e.target.value }))
                    }
                    aria-label={`OT rate for ${emp.name}`}
                    style={{
                      width: 88,
                      minHeight: 36,
                      padding: "0.35rem 0.5rem",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      textAlign: "right",
                    }}
                  />
                </div>
              ))}
            </div>

            <div
              className="flex items-center gap-2 flex-wrap"
              style={{ marginTop: "0.25rem" }}
            >
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={otSaving}
                onClick={() => void saveAllOtRates()}
                style={{
                  minHeight: 34,
                  padding: "0.35rem 0.9rem",
                  width: "auto",
                }}
              >
                {otSaving && !otApplyingMonth ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={otSaving}
                onClick={() => void applyOtRatesToCurrentMonth()}
                style={{
                  minHeight: 34,
                  padding: "0.35rem 0.9rem",
                  width: "auto",
                }}
                title={`Recalculate OT pay for ${currentMonthLabel} using saved standing rates`}
              >
                {otSaving && otApplyingMonth ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    Applying…
                  </>
                ) : (
                  "Apply new OT rates for the current month"
                )}
              </button>
            </div>
          </>
        )}

        {lastOtChange && !lastOtChange.undone_at && (
          <div className="mt-6 flex items-center gap-3 flex-wrap" style={{ maxWidth: 360 }}>
            <span className="text-sm text-secondary">
              Last change{" "}
              {new Date(lastOtChange.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
              {lastOtChange.creator?.username
                ? ` · ${lastOtChange.creator.username}`
                : ""}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={otUndoing === lastOtChange.id}
              onClick={() => void handleOtUndo(lastOtChange.id)}
            >
              {otUndoing === lastOtChange.id ? "Undoing…" : "Undo"}
            </button>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold mb-1">Salary adjustment</h2>
        <p className="text-secondary text-sm mb-4">
          {selectedOutlet
            ? `For ${selectedOutlet.name} only · switch outlet in the header to change another`
            : "Select an outlet in the header"}
        </p>
        <form onSubmit={handleApply} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 520 }}>
          {error && <div className="alert alert-danger">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <div className="form-group">
            <label className="form-label">Target</label>
            <div className="segmented" role="group">
              <button type="button" className={`segmented__btn ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
                All in this outlet
              </button>
              <button type="button" className={`segmented__btn ${scope === "employee" ? "active" : ""}`} onClick={() => setScope("employee")}>
                One employee
              </button>
            </div>
          </div>

          {scope === "employee" && (
            <Dropdown
              value={employeeId}
              onChange={setEmployeeId}
              options={empOptions}
              label="Employee"
              placeholder={salaryOutletId ? "Select employee" : "Select outlet first"}
            />
          )}

          <div className="form-group">
            <label className="form-label">Mode</label>
            <div className="segmented" role="group">
              <button type="button" className={`segmented__btn ${mode === "percent" ? "active" : ""}`} onClick={() => setMode("percent")}>
                Percent %
              </button>
              <button type="button" className={`segmented__btn ${mode === "amount" ? "active" : ""}`} onClick={() => setMode("amount")}>
                Fixed ₹
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="adj-value">
              {mode === "percent" ? "Percent change (e.g. 10 or -5)" : "Amount change (e.g. 500 or -200)"}
            </label>
            <input
              id="adj-value"
              type="number"
              className="form-input"
              step={mode === "percent" ? 0.1 : 1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? <><span className="spinner" />Applying…</> : "Apply adjustment"}
          </button>
        </form>
      </div>

      <h2 className="text-lg font-bold mb-1">Salary adjustment history</h2>
      <p className="text-secondary text-sm mb-4">
        {selectedOutlet ? selectedOutlet.name : "Select an outlet"}
      </p>
      {!salaryOutletId ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          Select an outlet to view its salary adjustment history.
        </div>
      ) : !adjustments?.length ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          No salary adjustments yet for this outlet.
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Details</th>
                <th>By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td className="text-secondary text-sm">
                    {new Date(a.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="font-semibold" style={{ whiteSpace: "pre-line" }}>
                    {a.changes?.length
                      ? a.changes
                          .map((c) => `${c.name} ${formatPlainSalary(c.from)} → ${formatPlainSalary(c.to)}`)
                          .join("\n")
                      : a.details ||
                        (a.mode === "percent"
                          ? `${Number(a.value)}%`
                          : formatINR(Number(a.value)))}
                  </td>
                  <td className="text-muted text-sm">{a.creator?.username ?? "—"}</td>
                  <td>
                    {a.undone_at ? (
                      <span className="badge badge-neutral">Undone</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                  <td>
                    {!a.undone_at && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={undoing === a.id}
                        onClick={() => handleUndo(a.id)}
                      >
                        {undoing === a.id ? "Undoing…" : "Undo"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}
