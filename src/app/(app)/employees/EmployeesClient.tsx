"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, X, Users } from "lucide-react";
import Link from "next/link";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { swrKeys } from "@/lib/swr-config";

interface Employee {
  id: string;
  outlet_id: string;
  name: string;
  monthly_salary: string;
  overtime_rate?: string;
  allowance_rate?: string;
  paid_leave_days: number;
  salary_hidden?: boolean;
  salary_masked?: boolean;
}

interface Me {
  role: string;
  outlet?: { id: string; name: string } | null;
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function EmployeesClient() {
  const { selectedOutletId, selectedOutlet } = useOutlets();
  const { data: me } = useSWR<Me>(swrKeys.me());
  const isAdmin = me?.role === "admin";
  const { data, isLoading, mutate } = useSWR<Employee[]>(
    selectedOutletId ? swrKeys.employees(selectedOutletId) : null
  );
  const employees = Array.isArray(data) ? data : [];
  const outletName = selectedOutlet?.name ?? me?.outlet?.name;
  const [showAdd, setShowAdd] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    monthly_salary: "",
    allowance_rate: "0",
    paid_leave_days: "0",
    salary_hidden: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openAdd() {
    setFormData({ name: "", monthly_salary: "", allowance_rate: "0", paid_leave_days: "0", salary_hidden: false });
    setError("");
    setShowAdd(true);
  }

  function openEdit(emp: Employee) {
    setFormData({
      name: emp.name,
      monthly_salary: String(emp.monthly_salary),
      allowance_rate: String(emp.allowance_rate ?? "0"),
      paid_leave_days: String(emp.paid_leave_days),
      salary_hidden: Boolean(emp.salary_hidden),
    });
    setError("");
    setEditEmployee(emp);
  }

  async function handleSave() {
    setError("");
    if (!formData.name.trim() || !formData.monthly_salary) {
      setError("Name and monthly salary are required.");
      return;
    }
    setSaving(true);
    try {
      if (editEmployee) {
        const res = await fetch(`/api/employees/${editEmployee.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            monthly_salary: Number(formData.monthly_salary),
            allowance_rate: Number(formData.allowance_rate),
            paid_leave_days: Number(formData.paid_leave_days),
            salary_hidden: formData.salary_hidden,
          }),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error); return; }
        setEditEmployee(null);
      } else {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outlet_id: selectedOutletId,
            name: formData.name,
            monthly_salary: Number(formData.monthly_salary),
            allowance_rate: Number(formData.allowance_rate),
            paid_leave_days: Number(formData.paid_leave_days),
            salary_hidden: isAdmin ? formData.salary_hidden : false,
          }),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error); return; }
        setShowAdd(false);
      }
      void mutate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Delete employee "${emp.name}"? This action cannot be undone.`)) return;
    const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Failed to delete employee.");
      return;
    }
    void mutate();
  }

  const EmpForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="emp-name">Full Name</label>
        <input id="emp-name" type="text" className="form-input" value={formData.name}
          onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} required autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="emp-salary">Monthly Salary (₹)</label>
        <input id="emp-salary" type="number" className="form-input" min={0} step={100}
          value={formData.monthly_salary}
          onChange={(e) => setFormData((f) => ({ ...f, monthly_salary: e.target.value }))} required />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="emp-allowance">Daily Allowance Rate (₹/day)</label>
        <input id="emp-allowance" type="number" className="form-input" min={0} step={10}
          value={formData.allowance_rate}
          onChange={(e) => setFormData((f) => ({ ...f, allowance_rate: e.target.value }))} />
        <span className="form-hint">Allowance = Daily Allowance Rate × Days Present</span>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="emp-leave">Paid Leave Allowance (Days)</label>
        <input id="emp-leave" type="number" className="form-input" min={0} max={30} step={1}
          value={formData.paid_leave_days}
          onChange={(e) => setFormData((f) => ({ ...f, paid_leave_days: e.target.value }))} />
      </div>
      {isAdmin && (
        <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={formData.salary_hidden}
            onChange={(e) => setFormData((f) => ({ ...f, salary_hidden: e.target.checked }))}
          />
          <span className="text-sm">Hide salary from staff on Payroll</span>
        </label>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditEmployee(null); }}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner" />Saving…</> : "Save Employee"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage outlet staff, base salaries, and paid leave allowances</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Add Employee
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Users size={32} strokeWidth={2} />
          </div>
          <p className="empty-state__title">
            {outletName ? `No employees in ${outletName}` : "No employees in this outlet"}
          </p>
          <p className="empty-state__desc">Add your first employee using the Add Employee button above.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Employee Name</th>
                {isAdmin && <th>Monthly Salary</th>}
                <th>Paid Leave</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <div className="flex items-center gap-3 font-bold">
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "50%",
                        background: "var(--color-primary)", color: "#FFFBF8",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: "0.9375rem", flexShrink: 0,
                      }}>
                        {emp.name.charAt(0).toUpperCase()}
                      </div>
                      <Link href={`/employees/${emp.id}`} className="text-primary" prefetch>{emp.name}</Link>
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="font-extrabold text-base">
                      {formatINR(Number(emp.monthly_salary))}
                    </td>
                  )}
                  <td>
                    <span className="badge badge-accent">{emp.paid_leave_days} Days</span>
                  </td>
                  <td>
                    <div className="flex gap-2 flex-wrap">
                      {isAdmin && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(emp)}>Edit</button>
                      )}
                      <Link href={`/attendance?employee=${emp.id}`} className="btn btn-outline btn-sm" prefetch>Attendance</Link>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(emp)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="modal-header">
          <h2>Add New Employee</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        {EmpForm}
      </Modal>

      <Modal open={!!editEmployee} onClose={() => setEditEmployee(null)}>
        <div className="modal-header">
          <h2>Edit Employee</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setEditEmployee(null)} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        {EmpForm}
      </Modal>
    </div>
  );
}
