import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, logAudit } from "@/lib/audit";
import { shouldHideEmployeeMoney } from "@/lib/money-visibility";

async function getEmployee(id: string, orgId: string) {
  return prisma.employee.findFirst({
    where: { id, outlet: { org_id: orgId } },
    include: { outlet: true },
  });
}

// GET /api/employees/:id
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const employee = await getEmployee(id, profile.org_id);
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    profile.role !== "admin" &&
    profile.outlet_id &&
    employee.outlet_id !== profile.outlet_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Staff: hide salary figures only when admin marked salary_hidden
  if (shouldHideEmployeeMoney(profile, employee.salary_hidden)) {
    return NextResponse.json({
      ...employee,
      monthly_salary: null,
      overtime_rate: null,
      allowance_rate: null,
      salary_masked: true,
      money_hidden: true,
    });
  }

  return NextResponse.json({ ...employee, salary_masked: false, money_hidden: false });
}

// PATCH /api/employees/:id — admin only
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") {
    return NextResponse.json(
      { error: "Only admin can edit employees after they are created" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const existing = await getEmployee(id, profile.org_id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.monthly_salary !== undefined && { monthly_salary: body.monthly_salary }),
      ...(body.overtime_rate !== undefined && { overtime_rate: Number(body.overtime_rate) }),
      ...(body.allowance_rate !== undefined && { allowance_rate: Number(body.allowance_rate) }),
      ...(body.paid_leave_days !== undefined && { paid_leave_days: Number(body.paid_leave_days) }),
      ...(body.salary_hidden !== undefined && { salary_hidden: Boolean(body.salary_hidden) }),
    },
  });

  const auditFields = [
    { key: "name", old: existing.name, new_: body.name },
    {
      key: "monthly_salary",
      old: String(existing.monthly_salary),
      new_: body.monthly_salary !== undefined ? String(body.monthly_salary) : undefined,
    },
    {
      key: "overtime_rate",
      old: String(existing.overtime_rate),
      new_: body.overtime_rate !== undefined ? String(body.overtime_rate) : undefined,
    },
    {
      key: "allowance_rate",
      old: String(existing.allowance_rate),
      new_: body.allowance_rate !== undefined ? String(body.allowance_rate) : undefined,
    },
    {
      key: "paid_leave_days",
      old: String(existing.paid_leave_days),
      new_: body.paid_leave_days !== undefined ? String(body.paid_leave_days) : undefined,
    },
    {
      key: "salary_hidden",
      old: String(existing.salary_hidden),
      new_: body.salary_hidden !== undefined ? String(Boolean(body.salary_hidden)) : undefined,
    },
  ];

  for (const { key, old, new_ } of auditFields) {
    if (new_ !== undefined && String(new_) !== String(old)) {
      await logAudit({
        org_id: profile.org_id,
        user_id: profile.id,
        entity_type: "Employee",
        entity_id: id,
        field_changed: key,
        old_value: old,
        new_value: String(new_),
        highlighted: key === "monthly_salary" || key === "overtime_rate",
        outlet_id: existing.outlet_id,
      });
    }
  }

  return NextResponse.json(updated);
}

// DELETE /api/employees/:id — admin or staff for their outlet
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getEmployee(id, profile.org_id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessOutlet(profile, existing.outlet_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.employee.delete({ where: { id } });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "Employee",
    entity_id: id,
    field_changed: "deleted",
    old_value: existing.name,
    new_value: null,
    outlet_id: existing.outlet_id,
  });

  return NextResponse.json({ success: true });
}
