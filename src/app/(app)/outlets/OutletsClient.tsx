"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, X, Building2 } from "lucide-react";
import { useOutlets } from "@/lib/outlet-context";
import { formatINR } from "@/lib/payroll";
import { swrKeys } from "@/lib/swr-config";

interface Outlet {
  id: string;
  name: string;
  overtime_rate: string;
  allowance_rate?: string;
  overtime_unit: "hour" | "day" | "fixed";
  created_at: string;
  _count?: { employees: number };
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

export default function OutletsClient() {
  const { refresh: refreshOutlets } = useOutlets();
  const { data, isLoading, mutate } = useSWR<Outlet[]>(swrKeys.outlets());
  const outlets = Array.isArray(data) ? data : [];
  const [showAdd, setShowAdd] = useState(false);
  const [editOutlet, setEditOutlet] = useState<Outlet | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    overtime_rate: "0",
    allowance_rate: "0",
    overtime_unit: "day" as "hour" | "day" | "fixed",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openAdd() {
    setFormData({ name: "", overtime_rate: "0", allowance_rate: "0", overtime_unit: "day" });
    setError("");
    setShowAdd(true);
  }

  function openEdit(outlet: Outlet) {
    setFormData({
      name: outlet.name,
      overtime_rate: String(outlet.overtime_rate),
      allowance_rate: String(outlet.allowance_rate ?? "0"),
      overtime_unit: outlet.overtime_unit,
    });
    setError("");
    setEditOutlet(outlet);
  }

  async function handleSave() {
    setError("");
    if (!formData.name.trim()) {
      setError("Outlet name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editOutlet) {
        const res = await fetch(`/api/outlets/${editOutlet.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            overtime_rate: Number(formData.overtime_rate),
            allowance_rate: Number(formData.allowance_rate),
            overtime_unit: "day",
          }),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error); return; }
        setEditOutlet(null);
        refreshOutlets();
      } else {
        const res = await fetch("/api/outlets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            overtime_rate: Number(formData.overtime_rate),
            allowance_rate: Number(formData.allowance_rate),
            overtime_unit: "day",
          }),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error); return; }
        setShowAdd(false);
        refreshOutlets();
      }
      void mutate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(outlet: Outlet) {
    const count = outlet._count?.employees ?? 0;
    const extra =
      count > 0
        ? ` This will also delete ${count} employee${count === 1 ? "" : "s"} and their attendance/payroll. Staff assigned here will need a new outlet.`
        : " Staff assigned here will need a new outlet.";
    if (!confirm(`Delete outlet "${outlet.name}"?${extra} This cannot be undone.`)) return;
    const res = await fetch(`/api/outlets/${outlet.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Failed to delete outlet.");
      return;
    }
    refreshOutlets();
    void mutate();
  }

  const FormContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="outlet-name">Outlet Name</label>
        <input
          id="outlet-name"
          type="text"
          className="form-input"
          placeholder="e.g. Downtown Branch"
          value={formData.name}
          onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
          required
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="ot-rate">Default OT rate for new employees (₹/day)</label>
        <input
          id="ot-rate"
          type="number"
          min={0}
          step={10}
          className="form-input"
          value={formData.overtime_rate}
          onChange={(e) => setFormData((f) => ({ ...f, overtime_rate: e.target.value, overtime_unit: "day" }))}
          required
        />
        <span className="form-hint">
          Copied onto new employees. Change individual rates anytime in Settings → Overtime rates per day.
        </span>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="allowance-rate">Default Allowance rate for new employees (₹/day)</label>
        <input
          id="allowance-rate"
          type="number"
          min={0}
          step={10}
          className="form-input"
          value={formData.allowance_rate}
          onChange={(e) => setFormData((f) => ({ ...f, allowance_rate: e.target.value }))}
          required
        />
        <span className="form-hint">
          Default daily allowance rate copied onto new employees created in this outlet.
        </span>
      </div>
      <div className="modal-footer" style={{ border: "none", padding: 0, margin: 0, marginTop: "0.5rem" }}>
        <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditOutlet(null); }}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner" />Saving…</> : "Save Outlet"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Outlets</h1>
          <p className="page-subtitle">Manage organization branches and overtime configuration</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={18} strokeWidth={2} />
          Add Outlet
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : outlets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">
            <Building2 size={28} strokeWidth={2} />
          </div>
          <p className="empty-state__title">No outlets found</p>
          <p className="empty-state__desc">Create your first outlet to start adding employees.</p>
          <button className="btn btn-primary mt-4" onClick={openAdd}>Add Outlet</button>
        </div>
      ) : (
        <div className="grid-2">
          {outlets.map((outlet) => (
            <div key={outlet.id} className="card">
              <div className="card-header-row mb-4">
                <div>
                  <h3 className="font-semibold">{outlet.name}</h3>
                  <p className="text-secondary text-sm">
                    {outlet._count?.employees ?? 0} employee{(outlet._count?.employees ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="card-header-row__actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(outlet)}>
                    Edit Settings
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(outlet)}>
                    Delete
                  </button>
                </div>
              </div>

              <div style={{ background: "var(--color-surface-2)", borderRadius: "var(--radius-md)", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-secondary">Default OT / day:</span>
                  <span className="font-semibold">{formatINR(Number(outlet.overtime_rate))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="modal-header">
          <h2>Add Outlet</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {FormContent}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editOutlet} onClose={() => setEditOutlet(null)}>
        <div className="modal-header">
          <h2>Edit Outlet</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setEditOutlet(null)} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {FormContent}
      </Modal>
    </div>
  );
}
