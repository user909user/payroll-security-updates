"use client";

import { preload } from "swr";
import { fetcher, swrKeys } from "@/lib/swr-config";

function shiftMonth(month: number, year: number, delta: number) {
  let m = month + delta;
  let y = year;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  return { month: m, year: y };
}

/** Warm SWR cache for the selected outlet so Dashboard / Payroll / Employees feel instant. */
export function prefetchOutletData(outletId: string, month?: number, year?: number) {
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();
  const prev = shiftMonth(m, y, -1);
  const next = shiftMonth(m, y, 1);

  void preload(swrKeys.employees(outletId), fetcher);
  void preload(swrKeys.outletPayroll(outletId, m, y, "dashboard"), fetcher);
  void preload(swrKeys.outletPayroll(outletId, m, y, "payroll"), fetcher);
  void preload(swrKeys.outletPayroll(outletId, prev.month, prev.year, "dashboard"), fetcher);
  void preload(swrKeys.outletPayroll(outletId, next.month, next.year, "dashboard"), fetcher);
  void preload(swrKeys.outletPayroll(outletId, prev.month, prev.year, "payroll"), fetcher);
  void preload(swrKeys.outletPayroll(outletId, next.month, next.year, "payroll"), fetcher);
}

export function prefetchRouteData(href: string, outletId: string) {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();

  if (href === "/dashboard" || href === "/payroll") {
    prefetchOutletData(outletId, m, y);
  } else if (href === "/employees" || href === "/attendance") {
    void preload(swrKeys.employees(outletId), fetcher);
  } else if (href === "/outlets") {
    void preload(swrKeys.outlets(), fetcher);
  } else if (href === "/users") {
    void preload(swrKeys.users(), fetcher);
  } else if (href === "/audit") {
    const params = new URLSearchParams();
    params.set("outlet_ids", outletId);
    params.set("page", "1");
    params.set("limit", "25");
    void preload(swrKeys.auditLogs(params), fetcher);
  }
}
