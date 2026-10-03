"use client";

import { useState } from "react";
import { X } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PaymentModal({
  employee,
  month,
  year,
  onClose,
  onSuccess,
}: {
  employee: { id: string; name: string };
  month: number;
  year: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<"salary" | "advance">("salary");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rounded = Math.round(Number(amount));
    if (!amount || !Number.isFinite(rounded) || rounded === 0) {
      setError("Enter a valid non-zero amount.");
      return;
    }
    if (rounded !== Number(amount)) {
      setAmount(String(rounded));
    }
    setSaving(true);
    const res = await fetch(`/api/employees/${employee.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        year,
        amount: rounded,
        type,
        paid_at: paidAt,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onSuccess();
      onClose();
    } else {
      const d = await res.json();
      setError(d.error);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Record Payment</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-secondary text-sm mb-4">
          For <strong>{employee.name}</strong> · {MONTHS[month - 1]} {year}
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label className="form-label">Payment Category</label>
            <div className="toggle-group" style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={`btn ${type === "salary" ? "btn-primary" : "btn-secondary"}`}
                style={{ flex: 1 }}
                onClick={() => setType("salary")}
              >
                Salary Given
              </button>
              <button
                type="button"
                className={`btn ${type === "advance" ? "btn-primary" : "btn-secondary"}`}
                style={{ flex: 1 }}
                onClick={() => setType("advance")}
              >
                Advance
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="payment-date">Date</label>
            <input
              id="payment-date"
              type="date"
              className="form-input"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="payment-amount">Amount (₹)</label>
            <input
              id="payment-amount"
              type="number"
              className="form-input"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 5000 or -2000 for correction"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                if (!amount) return;
                const rounded = Math.round(Number(amount));
                if (Number.isFinite(rounded) && rounded !== 0) setAmount(String(rounded));
              }}
              autoFocus
              required
            />
            <span className="form-hint">Enter positive for addition, or negative (e.g. -2000) for correction.</span>
          </div>
          <div className="modal-footer" style={{ border: "none", padding: 0, margin: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <><span className="spinner" />Recording…</>
              ) : (
                `Record ${type === "salary" ? "Salary Given" : "Advance"}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
