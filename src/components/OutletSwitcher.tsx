"use client";

import Dropdown from "@/components/Dropdown";
import { useOutlets } from "@/lib/outlet-context";

/** Admin: outlet picker. Staff: locked to the outlet assigned in Users. */
export default function OutletSwitcher({
  role,
  fallbackName,
}: {
  role: string;
  fallbackName?: string | null;
}) {
  const { outlets, selectedOutletId, selectedOutlet, setSelectedOutlet, loading } = useOutlets();
  const isAdmin = role === "admin";

  if (loading && outlets.length === 0) {
    return <div className="header-switcher header-switcher--placeholder">Loading…</div>;
  }

  // Staff: read-only name of the outlet assigned by admin (Users tab)
  if (!isAdmin) {
    const name = selectedOutlet?.name ?? fallbackName;
    if (!name) {
      return (
        <div className="header-outlet-label header-outlet-label--warn" aria-label="No outlet">
          No outlet assigned
        </div>
      );
    }
    return (
      <div className="header-outlet-label" aria-label="Your outlet">
        {name}
      </div>
    );
  }

  // Admin: always show the outlet changer
  if (outlets.length === 0) {
    return (
      <div className="header-outlet-label header-outlet-label--warn" aria-label="No outlets">
        No outlets yet
      </div>
    );
  }

  return (
    <Dropdown
      variant="header"
      value={selectedOutletId}
      onChange={setSelectedOutlet}
      options={outlets.map((o) => ({
        value: o.id,
        label: `${o.name} (${o.employee_count})`,
      }))}
      placeholder="Select outlet"
    />
  );
}
