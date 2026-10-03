import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { computeEmployeePayroll, saveEmployeePayrollSummary } from "@/lib/payroll-server";

// GET /api/employees/:id/payroll?month=&year=
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const computed = await computeEmployeePayroll(id, profile.org_id, month, year);
  if (!computed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(computed.payroll, {
    headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=90" },
  });
}

// POST /api/employees/:id/payroll — finalize/save a payroll summary
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { month, year, force_new_ot_rate } = body;

  if (!month || !year) {
    return NextResponse.json({ error: "month and year are required" }, { status: 400 });
  }

  const summary = await saveEmployeePayrollSummary(id, profile.org_id, month, year, {
    forceNewOtRate: Boolean(force_new_ot_rate),
  });
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const emp = await prisma.employee.findFirst({
    where: { id, outlet: { org_id: profile.org_id } },
    select: { outlet_id: true },
  });

  await logAudit({
    org_id: profile.org_id,
    user_id: profile.id,
    entity_type: "PayrollSummary",
    entity_id: summary.id,
    field_changed: "generated",
    old_value: null,
    new_value: JSON.stringify({
      month,
      year,
      total_pay: summary.total_pay,
      closing_balance: summary.closing_balance,
    }),
    outlet_id: emp?.outlet_id ?? null,
  });

  return NextResponse.json(summary);
}
