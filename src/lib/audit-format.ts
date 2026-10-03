/** Human-readable audit message helpers */

function formatMoney(value: string | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Prefer plain English over raw JSON / quote soup in audit tables.
 */
export function formatAuditDisplay(log: {
  entity_type: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
}): { summary: string; detail: string } {
  const field = log.field_changed ?? "change";
  const entity = log.entity_type;

  if (entity === "AuditLog" && field === "deleted_range") {
    return {
      summary: "Logs deleted",
      detail: log.new_value ?? "Logs deleted",
    };
  }

  if (entity === "Employee" && (field === "deleted" || field === "removed")) {
    return {
      summary: "Employee deleted",
      detail: log.old_value ? `${log.old_value} was removed` : "An employee was removed",
    };
  }

  if (entity === "Outlet" && (field === "deleted" || field === "removed")) {
    return {
      summary: "Outlet deleted",
      detail: [log.old_value, log.new_value].filter(Boolean).join(" · ") || "An outlet was removed",
    };
  }

  if (entity === "Profile" && (field === "deleted" || field === "removed")) {
    return {
      summary: "Staff deleted",
      detail: log.new_value
        ? `User removed: ${log.new_value}`
        : log.old_value
          ? `User removed: ${log.old_value}`
          : "A staff user was removed",
    };
  }

  if (entity === "Employee" && field === "monthly_salary") {
    return {
      summary: "Base salary changed",
      detail: `${formatMoney(log.old_value)} → ${formatMoney(log.new_value)}`,
    };
  }

  if (entity === "AttendanceRecord") {
    if (field === "status" || field === "overtime_units") {
      const raw = log.new_value ?? "";
      // "Name · Day, date · change" — pull day/date into summary so it's visible
      const parts = raw.split(" · ").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        const [name, when, ...rest] = parts;
        return {
          summary: field === "overtime_units" ? `OT · ${when}` : `Attendance · ${when}`,
          detail: `${name} · ${rest.join(" · ")}`,
        };
      }
      return {
        summary: field === "overtime_units" ? "Overtime updated" : "Attendance updated",
        detail: raw.includes("·")
          ? raw
          : `${titleCase(String(log.old_value ?? "—"))} → ${titleCase(String(log.new_value ?? "—"))}`,
      };
    }
  }

  if (entity === "SalaryPayment") {
    return {
      summary: field === "repayment" ? "Repayment recorded" : "Payment recorded",
      detail: log.new_value ?? formatMoney(log.new_value),
    };
  }

  if (entity === "SalaryAdjustment") {
    return {
      summary: field === "undo" ? "Salary adjust undone" : "Salary adjusted",
      detail: log.new_value ?? "—",
    };
  }

  // Avoid dumping JSON — show short readable text
  const clean = (v: string | null) => {
    if (v == null || v === "") return "—";
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        const parsed = JSON.parse(t) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return Object.entries(parsed)
            .map(([k, val]) => `${titleCase(k)}: ${String(val)}`)
            .join(" · ");
        }
      } catch {
        /* fall through */
      }
    }
    return v.replace(/^"+|"+$/g, "");
  };

  return {
    summary: `${entity}: ${titleCase(field)}`,
    detail:
      log.old_value != null || log.new_value != null
        ? `${clean(log.old_value)} → ${clean(log.new_value)}`
        : "—",
  };
}

export function shouldHighlightAudit(log: {
  highlighted?: boolean;
  entity_type: string;
  field_changed: string | null;
}) {
  if (log.highlighted) return true;
  if (log.entity_type === "Employee" && log.field_changed === "monthly_salary") return true;
  if (log.entity_type === "Profile" && (log.field_changed === "deleted" || log.field_changed === "removed"))
    return true;
  if (log.entity_type === "AuditLog" && log.field_changed === "deleted_range") return true;
  return false;
}
