import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, isAdmin, logAudit } from "@/lib/audit";

type SnapshotRow = {
  id: string;
  name?: string;
  monthly_salary: number;
  new_salary?: number;
};

function nextSalary(current: number, mode: string, amount: number) {
  const raw =
    mode === "percent"
      ? Math.round(current * (1 + amount / 100) * 100) / 100
      : Math.round((current + amount) * 100) / 100;
  return Math.max(0, raw);
}

function formatPlain(n: number) {
  return Number.isInteger(n) ? String(n) : String(n);
}

async function enrichAdjustments(
  adjustments: Array<{
    id: string;
    scope: string;
    mode: string;
    value: unknown;
    snapshot: string;
    [key: string]: unknown;
  }>
) {
  const ids = new Set<string>();
  const parsed: SnapshotRow[][] = [];

  for (const a of adjustments) {
    let rows: SnapshotRow[] = [];
    try {
      rows = JSON.parse(a.snapshot) as SnapshotRow[];
    } catch {
      rows = [];
    }
    parsed.push(rows);
    for (const r of rows) {
      if (r.id && !r.name) ids.add(r.id);
    }
  }

  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const emps = await prisma.employee.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    for (const e of emps) nameById.set(e.id, e.name);
  }

  return adjustments.map((a, i) => {
    const amount = Number(a.value);
    const changes = parsed[i].map((r) => {
      const from = Number(r.monthly_salary);
      const to =
        r.new_salary != null && Number.isFinite(Number(r.new_salary))
          ? Number(r.new_salary)
          : nextSalary(from, a.mode, amount);
      const name = r.name || nameById.get(r.id) || "Employee";
      return {
        id: r.id,
        name,
        from,
        to,
        label: `${name} ${formatPlain(from)} → ${formatPlain(to)}`,
      };
    });

    return {
      ...a,
      changes,
      details: changes.map((c) => c.label).join("\n"),
    };
  });
}

// GET /api/settings/salary-adjustments?outlet_id=
export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const outletId = searchParams.get("outlet_id");
  if (!outletId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, org_id: profile.org_id },
    select: { id: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const adjustments = await prisma.salaryAdjustment.findMany({
    where: { org_id: profile.org_id, outlet_id: outletId },
    orderBy: { created_at: "desc" },
    take: 50,
    include: {
      creator: { select: { username: true } },
    },
  });

  return NextResponse.json(await enrichAdjustments(adjustments));
}

// POST /api/settings/salary-adjustments — apply % or fixed ₹ change for one outlet
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { scope, employee_id, mode, value, outlet_id } = body as {
    scope?: string;
    employee_id?: string;
    mode?: string;
    value?: number;
    outlet_id?: string;
  };

  if (!outlet_id) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }
  if (scope !== "employee" && scope !== "all") {
    return NextResponse.json({ error: "scope must be employee or all" }, { status: 400 });
  }
  if (mode !== "percent" && mode !== "amount") {
    return NextResponse.json({ error: "mode must be percent or amount" }, { status: 400 });
  }
  if (value === undefined || !Number.isFinite(Number(value))) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }
  if (scope === "employee" && !employee_id) {
    return NextResponse.json({ error: "employee_id is required for employee scope" }, { status: 400 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outlet_id, org_id: profile.org_id },
    select: { id: true, name: true },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const amount = Number(value);

  const employees =
    scope === "all"
      ? await prisma.employee.findMany({
          where: { outlet_id: outlet.id },
          select: { id: true, name: true, monthly_salary: true },
        })
      : await prisma.employee.findMany({
          where: {
            id: employee_id,
            outlet_id: outlet.id,
          },
          select: { id: true, name: true, monthly_salary: true },
        });

  if (employees.length === 0) {
    return NextResponse.json({ error: "No employees found in this outlet" }, { status: 404 });
  }

  const snapshot = employees.map((e) => {
    const from = Number(e.monthly_salary);
    const to = nextSalary(from, mode, amount);
    return {
      id: e.id,
      name: e.name,
      monthly_salary: from,
      new_salary: to,
    };
  });

  await prisma.$transaction(
    snapshot.map((row) =>
      prisma.employee.update({
        where: { id: row.id },
        data: { monthly_salary: row.new_salary },
      })
    )
  );

  const adjustment = await prisma.salaryAdjustment.create({
    data: {
      org_id: profile.org_id,
      outlet_id: outlet.id,
      scope,
      employee_id: scope === "employee" ? employee_id! : null,
      mode,
      value: amount,
      snapshot: JSON.stringify(snapshot),
      created_by: profile.id,
    },
  });

  const detailLines = snapshot.map(
    (r) => `${r.name} ${formatPlain(r.monthly_salary)} → ${formatPlain(r.new_salary)}`
  );
  const modeLabel = mode === "percent" ? `${amount}%` : `₹${amount.toLocaleString("en-IN")}`;

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "SalaryAdjustment",
    entity_id: adjustment.id,
    field_changed: "apply",
    old_value: null,
    new_value: `${outlet.name}: ${detailLines.join("; ")} (${modeLabel})`,
    highlighted: true,
    outlet_id: outlet.id,
  });

  for (const row of snapshot) {
    await logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "Employee",
      entity_id: row.id,
      field_changed: "monthly_salary",
      old_value: String(row.monthly_salary),
      new_value: String(row.new_salary),
      highlighted: true,
      outlet_id: outlet.id,
    });
  }

  const [enriched] = await enrichAdjustments([
    {
      ...adjustment,
      creator: { username: profile.username },
    },
  ]);

  return NextResponse.json(enriched, { status: 201 });
}
