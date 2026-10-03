import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, isAdmin } from "@/lib/audit";
import { shouldHideEmployeeMoney } from "@/lib/money-visibility";
import { computeOutletPayroll } from "@/lib/payroll-server";

function parseOutletIds(searchParams: URLSearchParams): string[] {
  const multi = searchParams.getAll("outlet_id").filter(Boolean);
  const csv = searchParams.get("outlet_ids");
  if (csv) {
    return [...new Set([...multi, ...csv.split(",").map((s) => s.trim()).filter(Boolean)])];
  }
  return [...new Set(multi)];
}

// GET /api/audit-logs/balances?outlet_ids=&all=1
export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const wantAll = searchParams.get("all") === "1" || searchParams.get("all") === "true";
  let outletIds = parseOutletIds(searchParams);

  if (wantAll && isAdmin(profile)) {
    const allOutlets = await prisma.outlet.findMany({
      where: { org_id: profile.org_id },
      select: { id: true },
    });
    outletIds = allOutlets.map((o) => o.id);
  }

  if (outletIds.length === 0 && !isAdmin(profile) && profile.outlet_id) {
    outletIds = [profile.outlet_id];
  }

  if (outletIds.length === 0) {
    return NextResponse.json({ error: "Select at least one outlet" }, { status: 400 });
  }

  for (const id of outletIds) {
    if (!canAccessOutlet(profile, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const outlets = await prisma.outlet.findMany({
    where: { id: { in: outletIds }, org_id: profile.org_id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (outlets.length === 0) {
    return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const results = await Promise.all(
    outlets.map(async (outlet) => {
      const payroll = await computeOutletPayroll(outlet.id, profile.org_id, month, year, {
        includeHidden: true,
      });
      return { outlet, payroll };
    })
  );

  const items = [];
  for (const { outlet, payroll } of results) {
    if (!payroll) continue;
    for (const emp of payroll.employees) {
      if (shouldHideEmployeeMoney(profile, emp.salary_hidden)) continue;
      const row = payroll.payroll[emp.id];
      if (!row || Math.abs(row.closing_balance) < 0.005) continue;
      items.push({
        id: emp.id,
        name: emp.name,
        outlet_id: outlet.id,
        outlet_name: outlet.name,
        amount: Math.abs(row.closing_balance),
        status: row.closing_balance < 0 ? "advance" : "owed",
      });
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name, "en"));

  return NextResponse.json(
    { month, year, items },
    { headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" } }
  );
}
