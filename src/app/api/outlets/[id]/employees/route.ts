import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessOutlet, getAuthProfile, isAdmin } from "@/lib/audit";

// GET /api/outlets/:id/employees
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!canAccessOutlet(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await prisma.employee.findMany({
    where: { outlet_id: id, outlet: { org_id: profile.org_id } },
    orderBy: { name: "asc" },
  });

  const nowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = nowStr.split("-").map(Number);
  const todayObj = new Date(Date.UTC(y, m - 1, d));

  const [todayRecords, publicHoliday] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        employee_id: { in: employees.map((e) => e.id) },
        date: todayObj,
      },
      select: { employee_id: true, status: true, overtime_units: true },
    }),
    prisma.publicHoliday.findUnique({
      where: { outlet_id_date: { outlet_id: id, date: todayObj } },
      select: { id: true },
    }),
  ]);

  const todayMarkMap = new Map<string, "P" | "A" | "Ot" | "H" | "PH">();
  if (publicHoliday) {
    for (const employee of employees) todayMarkMap.set(employee.id, "PH");
  }
  for (const r of todayRecords) {
    if (publicHoliday) continue;
    if (r.status === "absent") todayMarkMap.set(r.employee_id, "A");
    else if (r.status === "half") todayMarkMap.set(r.employee_id, "H");
    else if (r.status === "present") {
      const hasOt = r.overtime_units != null && Number(r.overtime_units) > 0;
      todayMarkMap.set(r.employee_id, hasOt ? "Ot" : "P");
    }
  }

  // Staff: never receive salary / OT rate figures
  const safe = employees.map((e) => {
    const mark = todayMarkMap.get(e.id) ?? null;
    if (isAdmin(profile)) {
      return { ...e, today_mark: mark, salary_masked: false };
    }
    return {
      ...e,
      monthly_salary: 0 as unknown as typeof e.monthly_salary,
      overtime_rate: 0 as unknown as typeof e.overtime_rate,
      today_mark: mark,
      salary_masked: true,
    };
  });

  return NextResponse.json(safe, {
    headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=20" },
  });
}
