"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, X } from "lucide-react";
import Dropdown from "@/components/Dropdown";
import { swrKeys } from "@/lib/swr-config";

interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: "admin" | "staff";
  outlet_id: string | null;
  outlet?: { id: string; name: string } | null;
  created_at: string;
}

interface OutletOption {
  id: string;
  name: string;
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

export default function UsersClient() {
  const { data, isLoading, mutate } = useSWR<UserProfile[]>(swrKeys.users());
  const { data: me } = useSWR<{ id: string }>(swrKeys.me());
  const { data: outletsData } = useSWR<OutletOption[]>(swrKeys.outlets());
  const users = Array.isArray(data) ? data : [];
  const outlets = Array.isArray(outletsData) ? outletsData : [];
  const [showAdd, setShowAdd] = useState(false);
  const [moveUser, setMoveUser] = useState<UserProfile | null>(null);
  const [moveOutletId, setMoveOutletId] = useState("");
  const [moving, setMoving] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "staff" as "admin" | "staff",
    outlet_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [moveError, setMoveError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function openAdd() {
    setFormData({
      username: "",
      email: "",
      password: "",
      role: "staff",
      outlet_id: outlets[0]?.id ?? "",
    });
    setError("");
    setShowAdd(true);
  }

  function openMove(user: UserProfile) {
    setMoveUser(user);
    setMoveOutletId(user.outlet_id ?? outlets[0]?.id ?? "");
    setMoveError("");
  }

  function openSetPassword(user: UserProfile) {
    setPasswordUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordUser) return;
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch(`/api/users/${passwordUser.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || "Failed to set password.");
        return;
      }
      setPasswordUser(null);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleMoveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!moveUser) return;
    setMoveError("");
    if (!moveOutletId) {
      setMoveError("Select an outlet.");
      return;
    }
    setMoving(true);
    try {
      const res = await fetch(`/api/users/${moveUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: moveOutletId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMoveError(data.error || "Failed to move staff.");
        return;
      }
      setMoveUser(null);
      void mutate();
    } finally {
      setMoving(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!formData.username || !formData.email || !formData.password) {
      setError("Username, email, and password are required.");
      return;
    }
    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (formData.role === "staff" && !formData.outlet_id) {
      setError("Staff users must be assigned to an outlet.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username.trim().toLowerCase(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          role: formData.role,
          outlet_id: formData.role === "staff" ? formData.outlet_id : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create user.");
        return;
      }
      setShowAdd(false);
      void mutate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser(user: UserProfile) {
    if (!confirm(`Are you sure you want to remove user "${user.username}"?`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      void mutate();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to delete user.");
    }
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">
            Outlets are separate. Each staff login belongs to one outlet. To cover two outlets, create two staff accounts.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={18} strokeWidth={2} />
          Add User
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No users found</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Outlet</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2 font-medium">
                      <div style={{
                        width: "30px", height: "30px", borderRadius: "50%",
                        background: "var(--color-primary)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, color: "#fff", fontSize: "0.8125rem", flexShrink: 0,
                      }}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      {u.username}
                    </div>
                  </td>
                  <td className="text-secondary">{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "badge-accent" : "badge-neutral"}`} style={{ textTransform: "uppercase" }}>
                      {u.role}
                    </span>
                  </td>
                  <td className="text-secondary text-sm">
                    {u.role === "admin" ? "All outlets" : (u.outlet?.name ?? "—")}
                  </td>
                  <td className="text-muted text-xs">
                    {new Date(u.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td>
                    <div className="flex gap-2 flex-wrap">
                      {u.role === "staff" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openMove(u)}>
                          Move outlet
                        </button>
                      )}
                      {u.id !== me?.id && (
                        <button className="btn btn-outline btn-sm" onClick={() => openSetPassword(u)}>
                          Set password
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u)}>
                        Remove
                      </button>
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
          <h2>Add New User</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="user-username">Username</label>
            <input
              id="user-username"
              type="text"
              className="form-input"
              placeholder="e.g. john_doe"
              value={formData.username}
              onChange={(e) => setFormData((f) => ({ ...f, username: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="user-email">Email</label>
            <input
              id="user-email"
              type="email"
              className="form-input"
              placeholder="e.g. john@example.com"
              value={formData.email}
              onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="user-password">Password</label>
            <input
              id="user-password"
              type="password"
              className="form-input"
              placeholder="Minimum 8 characters"
              value={formData.password}
              onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <Dropdown
              value={formData.role}
              onChange={(v) => setFormData((f) => ({ ...f, role: v as "admin" | "staff" }))}
              options={[
                { value: "staff", label: "Staff (Standard access)" },
                { value: "admin", label: "Admin (Full system access)" },
              ]}
              label="Role"
            />
          </div>

          {formData.role === "staff" && (
            <div className="form-group">
              <Dropdown
                value={formData.outlet_id}
                onChange={(v) => setFormData((f) => ({ ...f, outlet_id: v }))}
                options={outlets.map((o) => ({ value: o.id, label: o.name }))}
                label="Assigned Outlet"
                placeholder="Select outlet"
              />
              <p className="text-muted text-xs mt-2">
                Staff can only access this outlet. Need them on another outlet too? Add a second staff user there.
              </p>
            </div>
          )}

          <div className="modal-footer" style={{ border: "none", padding: 0, margin: 0, marginTop: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner" />Creating…</> : "Create User"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(moveUser)} onClose={() => setMoveUser(null)}>
        <div className="modal-header">
          <h2>Move staff outlet</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setMoveUser(null)} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleMoveUser} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {moveError && <div className="alert alert-danger">{moveError}</div>}
          <p className="text-secondary text-sm">
            Move <strong>{moveUser?.username}</strong> to a different outlet. They will only see that outlet after this.
          </p>
          <Dropdown
            value={moveOutletId}
            onChange={setMoveOutletId}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            label="New outlet"
            placeholder="Select outlet"
          />
          <div className="modal-footer" style={{ border: "none", padding: 0, margin: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setMoveUser(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={moving}>
              {moving ? <><span className="spinner" />Moving…</> : "Move"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(passwordUser)} onClose={() => setPasswordUser(null)}>
        <div className="modal-header">
          <h2>Set password</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => setPasswordUser(null)} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSetPassword} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {passwordError && <div className="alert alert-danger">{passwordError}</div>}
          <p className="text-secondary text-sm">
            Set a new password for <strong>{passwordUser?.username}</strong>.
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="set-password">New password</label>
            <input
              id="set-password"
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="set-password-confirm">Confirm password</label>
            <input
              id="set-password-confirm"
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="modal-footer" style={{ border: "none", padding: 0, margin: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPasswordUser(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
              {passwordSaving ? <><span className="spinner" />Saving…</> : "Set password"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
