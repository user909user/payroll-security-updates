import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, logAudit } from "@/lib/audit";

// POST /api/employees — create employee
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { outlet_id, name, monthly_salary, paid_leave_days, salary_hidden } = body;

  if (!outlet_id || !name || monthly_salary === undefined) {
    return NextResponse.json(
      { error: "outlet_id, name, and monthly_salary are required." },
      { status: 400 }
    );
  }

  if (!canAccessOutlet(profile, outlet_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: outlet_id, org_id: profile.org_id },
  });
  if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });

  const employee = await prisma.employee.create({
    data: {
      outlet_id,
      name: name.trim(),
      monthly_salary,
      overtime_rate:
        body.overtime_rate !== undefined
          ? Number(body.overtime_rate)
          : Number(outlet.overtime_rate) || 0,
      allowance_rate:
        body.allowance_rate !== undefined
          ? Number(body.allowance_rate)
          : Number(outlet.allowance_rate) || 0,
      paid_leave_days: paid_leave_days ?? 0,
      salary_hidden: profile.role === "admin" ? Boolean(salary_hidden) : false,
    },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Employee",
    entity_id: employee.id,
    field_changed: "created",
    old_value: null,
    new_value: `Employee added: ${employee.name}`,
    outlet_id,
  });

  return NextResponse.json(employee, { status: 201 });
}
