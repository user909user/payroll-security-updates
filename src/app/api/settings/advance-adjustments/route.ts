import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";

// GET /api/settings/advance-adjustments?outlet_id=...&month=...&year=...
export async function GET(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const outletId = searchParams.get("outlet_id");
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(searchParams.get("year") || new Date().getFullYear());

  if (!outletId) {
    return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({
    where: { outlet_id: outletId, outlet: { org_id: profile.org_id } },
    select: { id: true, name: true, monthly_salary: true },
    orderBy: { name: "asc" },
  });

  const payments = await prisma.salaryPayment.findMany({
    where: {
      employee_id: { in: employees.map((e) => e.id) },
      month,
      year,
    },
    select: { employee_id: true, amount: true, type: true },
  });

  const paymentsByEmp = new Map<string, number>();
  for (const p of payments) {
    const current = paymentsByEmp.get(p.employee_id) || 0;
    const amt = Number(p.amount) || 0;
    paymentsByEmp.set(p.employee_id, current + amt);
  }

  const result = employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    advance_given: paymentsByEmp.get(emp.id) || 0,
  }));

  return NextResponse.json({ month, year, employees: result });
}

// POST /api/settings/advance-adjustments — bulk update employee current month advances
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { outlet_id, month, year, advances } = body;

  if (!outlet_id || !Array.isArray(advances)) {
    return NextResponse.json({ error: "outlet_id and advances array are required" }, { status: 400 });
  }

  const targetMonth = Number(month || new Date().getMonth() + 1);
  const targetYear = Number(year || new Date().getFullYear());

  const updatedLines: string[] = [];

  for (const item of advances) {
    const empId = String(item.employee_id);
    const newAmount = Math.max(0, Math.round(Number(item.amount) || 0));

    const emp = await prisma.employee.findFirst({
      where: { id: empId, outlet_id, outlet: { org_id: profile.org_id } },
      select: { id: true, name: true },
    });
    if (!emp) continue;

    // Delete existing salary payments for this month
    await prisma.salaryPayment.deleteMany({
      where: { employee_id: empId, month: targetMonth, year: targetYear },
    });

    if (newAmount > 0) {
      await prisma.salaryPayment.create({
        data: {
          employee_id: empId,
          month: targetMonth,
          year: targetYear,
          amount: newAmount,
          type: "salary",
          created_by: profile.id,
        },
      });
    }

    updatedLines.push(`${emp.name}: ₹${newAmount}`);

    await logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "SalaryPayment",
      entity_id: empId,
      field_changed: "advance_given",
      old_value: "adjusted",
      new_value: `Advance set to ₹${newAmount}`,
      outlet_id,
    });
  }

  return NextResponse.json({
    success: true,
    message: `Updated advance given for ${updatedLines.length} employees`,
    lines: updatedLines,
  });
}
