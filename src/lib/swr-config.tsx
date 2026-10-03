"use client";

import { preload, SWRConfig } from "swr";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      res.ok
        ? "Server returned a page instead of data. Rebuild the Windows app after updating."
        : `Request failed (${res.status})`
    );
  }
  if (!res.ok) {
    const err = body && typeof body === "object" && "error" in body ? (body as { error?: string }).error : null;
    throw new Error(err ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        revalidateIfStale: false,
        dedupingInterval: 15_000,
        keepPreviousData: true,
        errorRetryCount: 1,
      }}
    >
      {children}
    </SWRConfig>
  );
}

export { fetcher, preload };

/** Invalidate payroll caches after payments, attendance, or summary saves */
export async function invalidatePayrollCaches(outletId?: string, employeeId?: string) {
  const { mutate } = await import("swr");
  await mutate(
    (key) => {
      if (typeof key !== "string") return false;
      if (outletId && key.includes(`/api/outlets/${outletId}/payroll`)) return true;
      // Refresh employee overview/payroll — do NOT revalidate attendance
      // (stale HTTP cache was overwriting optimistic calendar updates).
      if (employeeId && key.includes(`/api/employees/${employeeId}/overview`)) return true;
      if (employeeId && key.includes(`/api/employees/${employeeId}/payroll`)) return true;
      if (employeeId && key.includes(`/api/employees/${employeeId}/payments`)) return true;
      return false;
    },
    undefined,
    { revalidate: true }
  );
}

/** Refresh outlet, attendance, and payroll data after a public holiday changes. */
export async function invalidatePublicHolidayCaches(outletId: string) {
  const { mutate } = await import("swr");
  await mutate(
    (key) =>
      typeof key === "string" &&
      (key === `/api/outlets/${outletId}/employees` ||
        key.includes("/attendance?") ||
        key.includes(`/api/outlets/${outletId}/payroll`) ||
        key.includes("/overview?") ||
        key.includes("/payroll?")),
    undefined,
    { revalidate: true }
  );
}

export const swrKeys = {
  outlets: () => "/api/outlets",
  employees: (outletId: string) => `/api/outlets/${outletId}/employees`,
  outletPayroll: (outletId: string, month: number, year: number, forPage: "dashboard" | "payroll" = "dashboard") =>
    `/api/outlets/${outletId}/payroll?month=${month}&year=${year}${forPage === "payroll" ? "&for=payroll" : ""}`,
  me: () => "/api/me",
  salaryAdjustments: (outletId: string) =>
    `/api/settings/salary-adjustments?outlet_id=${outletId}`,
  overtimeAdjustments: (outletId: string) =>
    `/api/settings/overtime-rates?outlet_id=${outletId}`,
  employeeOverview: (employeeId: string, month: number, year: number) =>
    `/api/employees/${employeeId}/overview?month=${month}&year=${year}`,
  attendance: (employeeId: string, month: number, year: number) =>
    `/api/employees/${employeeId}/attendance?month=${month}&year=${year}`,
  auditLogs: (params: URLSearchParams) => `/api/audit-logs?${params.toString()}`,
  auditBalances: (params: URLSearchParams) => `/api/audit-logs/balances?${params.toString()}`,
  users: () => "/api/users",
};
