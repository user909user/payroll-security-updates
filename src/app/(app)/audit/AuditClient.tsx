"use client";

import { useEffect, useState, useMemo } from "react";
import useSWR from "swr";
import Dropdown from "@/components/Dropdown";
import DatePicker from "@/components/DatePicker";
import { useOutlets } from "@/lib/outlet-context";
import { formatAuditDisplay, shouldHighlightAudit } from "@/lib/audit-format";
import { formatINR } from "@/lib/payroll";
import { swrKeys } from "@/lib/swr-config";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BALANCES_TYPE = "balances";

interface AuditLogItem {
  id: string;
  entity_type: string;
  entity_id: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  highlighted?: boolean;
  timestamp: string;
  employee_name?: string | null;
  user: {
    username: string;
    email: string;
  };
  outlet?: { id: string; name: string } | null;
}

interface Me {
  role: string;
  outlet_id?: string | null;
}

export default function AuditClient() {
  const { outlets, selectedOutletId } = useOutlets();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [selectedOutletIds, setSelectedOutletIds] = useState<string[]>([]);
  const [outletsReady, setOutletsReady] = useState(false);

  const { data: me } = useSWR<Me>(swrKeys.me());
  const isAdmin = me?.role === "admin";
  const meReady = me != null;

  // Admin: default all outlets selected. Staff: locked to their outlet.
  useEffect(() => {
    if (!outlets.length || !meReady) return;
    if (isAdmin) {
      setSelectedOutletIds((prev) => {
        if (outletsReady && prev.length > 0) {
          const valid = prev.filter((id) => outlets.some((o) => o.id === id));
          return valid.length > 0 ? valid : outlets.map((o) => o.id);
        }
        return outlets.map((o) => o.id);
      });
      setOutletsReady(true);
      return;
    }
    const staffOutlet =
      me?.outlet_id && outlets.some((o) => o.id === me.outlet_id)
        ? me.outlet_id
        : selectedOutletId && outlets.some((o) => o.id === selectedOutletId)
          ? selectedOutletId
          : outlets[0]?.id;
    if (staffOutlet) setSelectedOutletIds([staffOutlet]);
    setOutletsReady(true);
  }, [outlets, isAdmin, meReady, me?.outlet_id, selectedOutletId, outletsReady]);

  useEffect(() => {
    setPage(1);
  }, [selectedOutletIds.join(","), entityType, dateFrom, dateTo]);

  const allSelected =
    outlets.length > 0 && selectedOutletIds.length === outlets.length;

  const showingBalances = entityType === BALANCES_TYPE;

  const outletQuery = useMemo(() => {
    if (!selectedOutletIds.length) return null;
    const p = new URLSearchParams();
    if (isAdmin && allSelected) p.set("all", "1");
    else p.set("outlet_ids", selectedOutletIds.join(","));
    return p;
  }, [selectedOutletIds, allSelected, isAdmin]);

  const params = useMemo(() => {
    if (!outletQuery || showingBalances) return null;
    const p = new URLSearchParams(outletQuery);
    p.set("page", String(page));
    p.set("limit", "25");
    if (entityType) p.set("entity_type", entityType);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    return p;
  }, [outletQuery, showingBalances, page, entityType, dateFrom, dateTo]);

  const { data, isLoading, mutate } = useSWR<{
    logs: AuditLogItem[];
    total: number;
    pages: number;
  }>(params ? swrKeys.auditLogs(params) : null);

  const { data: balancesData, isLoading: balancesLoading } = useSWR<{
    month: number;
    year: number;
    items: {
      id: string;
      name: string;
      outlet_id: string;
      outlet_name: string;
      amount: number;
      status: "advance" | "owed";
    }[];
  }>(showingBalances && outletQuery ? swrKeys.auditBalances(outletQuery) : null);

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  function toggleAll(checked: boolean) {
    if (!isAdmin) return;
    setSelectedOutletIds(checked ? outlets.map((o) => o.id) : []);
  }

  function toggleOutlet(id: string, checked: boolean) {
    if (!isAdmin) return;
    setSelectedOutletIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }

  async function handleDeleteOld() {
    if (!isAdmin || selectedOutletIds.length === 0) return;
    const label = allSelected
      ? "all outlets"
      : selectedOutletIds.length === 1
        ? outlets.find((o) => o.id === selectedOutletIds[0])?.name ?? "this outlet"
        : `${selectedOutletIds.length} selected outlets`;
    if (
      !confirm(
        `Delete all audit logs older than 3 years for ${label}? This cannot be undone. A summary entry will be kept.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const q = new URLSearchParams();
      if (allSelected) q.set("all", "1");
      else q.set("outlet_ids", selectedOutletIds.join(","));
      const res = await fetch(`/api/audit-logs?${q.toString()}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error || "Failed to delete logs");
        return;
      }
      alert(body.message || `Deleted ${body.deleted} logs`);
      void mutate();
    } finally {
      setDeleting(false);
    }
  }

  const outletFilterLabel = allSelected
    ? "All outlets"
    : selectedOutletIds.length === 1
      ? outlets.find((o) => o.id === selectedOutletIds[0])?.name ?? "1 outlet"
      : `${selectedOutletIds.length} outlets`;

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">
            {!selectedOutletIds.length
              ? "Select at least one outlet"
              : showingBalances
                ? `${outletFilterLabel} · employees with a non-zero balance`
                : `${outletFilterLabel} · readable history (${total} total)`}
          </p>
        </div>
        {isAdmin && selectedOutletIds.length > 0 && (
          <button className="btn btn-danger" onClick={handleDeleteOld} disabled={deleting}>
            {deleting ? (
              <>
                <span className="spinner" />
                Deleting…
              </>
            ) : (
              "Delete logs older than 3 years"
            )}
          </button>
        )}
      </div>

      <div className="card mb-6" style={{ padding: "1rem 1.25rem" }}>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="form-group" style={{ flex: "1 1 180px" }}>
            <Dropdown
              value={entityType}
              onChange={(v) => {
                setEntityType(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "All Entities" },
                { value: "Employee", label: "Employee" },
                { value: "AttendanceRecord", label: "Attendance" },
                { value: "PayrollSummary", label: "Payroll" },
                { value: "SalaryPayment", label: "Salary Payment" },
                { value: "SalaryAdjustment", label: "Salary Adjustment" },
                { value: "OvertimeRateAdjustment", label: "OT Rate" },
                { value: "Outlet", label: "Outlet" },
                { value: "Profile", label: "Users" },
                { value: "deleted", label: "Deleted" },
                { value: BALANCES_TYPE, label: "Advances and outstanding" },
                { value: "AuditLog", label: "Audit deletes" },
              ]}
              label="Entity Type"
            />
          </div>

          {!showingBalances && (
            <>
              <div className="form-group" style={{ flex: "1 1 160px" }}>
                <DatePicker
                  label="From Date"
                  value={dateFrom}
                  onChange={(v) => {
                    setDateFrom(v);
                    setPage(1);
                  }}
                />
              </div>

              <div className="form-group" style={{ flex: "1 1 160px" }}>
                <DatePicker
                  label="To Date"
                  value={dateTo}
                  onChange={(v) => {
                    setDateTo(v);
                    setPage(1);
                  }}
                />
              </div>
            </>
          )}

          {(entityType || dateFrom || dateTo) && (
            <div style={{ marginTop: "auto" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEntityType("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        {isAdmin && outlets.length > 0 && (
          <div
            className="mt-4 pt-4 border-t"
            style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.25rem", alignItems: "center" }}
          >
            <span className="text-muted text-xs font-semibold uppercase" style={{ letterSpacing: "0.04em" }}>
              Outlets
            </span>
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              All
            </label>
            {outlets.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selectedOutletIds.includes(o.id)}
                  onChange={(e) => toggleOutlet(o.id, e.target.checked)}
                />
                {o.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {!selectedOutletIds.length ? (
        <div className="card text-center text-muted" style={{ padding: "2rem" }}>
          Select at least one outlet to view audit logs.
        </div>
      ) : showingBalances ? (
        balancesLoading && !balancesData ? (
          <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : (balancesData?.items.length ?? 0) === 0 ? (
          <div className="empty-state">
            <p className="empty-state__title">No advances or outstanding balances</p>
            <p className="empty-state__desc">Everyone in the selected outlets is fully settled this month.</p>
          </div>
        ) : (
          <div className="table-container">
            <div className="px-4 py-3 bg-surface border-b flex justify-between items-center">
              <span className="text-muted text-xs font-bold uppercase">
                {MONTHS[(balancesData?.month ?? 1) - 1]} {balancesData?.year} · {balancesData?.items.length}{" "}
                {(balancesData?.items.length ?? 0) === 1 ? "employee" : "employees"}
              </span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th style={{ textAlign: "right", color: "var(--color-danger)" }}>Advance</th>
                  <th style={{ textAlign: "right", color: "var(--color-secondary)" }}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {balancesData!.items.map((item) => {
                  const isAdvance = item.status === "advance";
                  const isOwed = item.status === "owed";
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="font-semibold text-sm">{item.name}</div>
                        {(allSelected || selectedOutletIds.length > 1) && (
                          <div className="text-muted text-xs">{item.outlet_name}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }} className="font-bold amount-negative">
                        {isAdvance ? formatINR(item.amount) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }} className="font-bold amount-positive">
                        {isOwed ? formatINR(item.amount) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : isLoading && !data ? (
        <div className="flex items-center justify-center" style={{ padding: "4rem" }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">
            {entityType === "deleted" ? "No deleted records found" : "No audit records found"}
          </p>
          <p className="empty-state__desc">Try adjusting your filters or outlet selection.</p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  {!allSelected && selectedOutletIds.length > 1 && <th>Outlet</th>}
                  {allSelected && <th>Outlet</th>}
                  <th>Summary</th>
                  <th>Details</th>
                  <th>Employee</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const display = formatAuditDisplay(log);
                  const highlight = shouldHighlightAudit(log);
                  const showOutlet = allSelected || selectedOutletIds.length > 1;
                  return (
                    <tr
                      key={log.id}
                      className={highlight ? "audit-row--highlight" : undefined}
                    >
                      <td className="text-muted text-xs white-space-nowrap">
                        {new Date(log.timestamp).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>
                        <span className="font-medium text-sm">
                          {log.user?.username ?? "System"}
                        </span>
                      </td>
                      {showOutlet && (
                        <td className="text-secondary text-sm">
                          {log.outlet?.name ?? "—"}
                        </td>
                      )}
                      <td>
                        <span className="font-semibold text-sm">{display.summary}</span>
                        {entityType !== "deleted" && (
                          <div className="text-muted text-xs mt-1">{log.entity_type}</div>
                        )}
                      </td>
                      <td
                        className="text-sm"
                        style={{ whiteSpace: "normal", wordBreak: "break-word" }}
                      >
                        {display.detail}
                      </td>
                      <td className="text-sm font-medium">
                        {log.employee_name || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-secondary">
                Page {page} of {pages}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
