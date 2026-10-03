import { PrismaClient, type Outlet, type Profile } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { calculateBalance, calculatePayroll } from "../src/lib/payroll";

const prisma = new PrismaClient();

// Loose admin client type — createClient(url, key) is not assignable to bare ReturnType<typeof createClient>
type AdminClient = SupabaseClient<any, "public", any>;

type DemoEmployee = {
  name: string;
  monthly_salary: number;
  paid_leave_days: number;
  /** Approximate present days this month; rest of weekday-like pattern handled in generator */
  absentDays: number[];
  overtimeDays: Record<number, number>;
};

async function ensureAuthUser(
  supabaseAdmin: AdminClient,
  email: string,
  password: string
) {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error && created.user) return created.user;

  // Already exists — look it up
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    throw new Error(`Failed to list auth users: ${listError.message}`);
  }

  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    throw new Error(
      `Failed to create auth user ${email}: ${error?.message ?? "unknown error"}`
    );
  }
  return existing;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function buildAttendance(
  year: number,
  month: number,
  absentDays: number[],
  overtimeDays: Record<number, number>
) {
  const total = daysInMonth(year, month);
  const records: {
    date: Date;
    status: "present" | "absent";
    overtime_units: number | null;
  }[] = [];

  for (let day = 1; day <= total; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay(); // 0 Sun … 6 Sat
    // Skip Sundays for a realistic work calendar
    if (weekday === 0) continue;

    if (absentDays.includes(day)) {
      records.push({ date, status: "absent", overtime_units: null });
    } else {
      records.push({
        date,
        status: "present",
        overtime_units: overtimeDays[day] ?? null,
      });
    }
  }

  return records;
}

async function seedAttendanceAndPayroll(
  employeeId: string,
  monthlySalary: number,
  paidLeaveDays: number,
  overtimeRate: number,
  year: number,
  month: number,
  absentDays: number[],
  overtimeDays: Record<number, number>,
  adminId: string,
  paymentAmount: number | null,
  previousBalance: number
) {
  const records = buildAttendance(year, month, absentDays, overtimeDays);

  await prisma.attendanceRecord.createMany({
    data: records.map((r) => ({
      employee_id: employeeId,
      date: r.date,
      status: r.status,
      overtime_units: r.overtime_units,
    })),
    skipDuplicates: true,
  });

  const days_present = records.filter((r) => r.status === "present").length;
  const days_absent = records.filter((r) => r.status === "absent").length;
  const overtime_total_units = records.reduce(
    (sum, r) => sum + (r.overtime_units ?? 0),
    0
  );

  let salary_given = 0;
  if (paymentAmount != null && paymentAmount > 0) {
    await prisma.salaryPayment.create({
      data: {
        employee_id: employeeId,
        month,
        year,
        amount: paymentAmount,
        created_by: adminId,
        paid_at: new Date(Date.UTC(year, month - 1, Math.min(28, daysInMonth(year, month)))),
      },
    });
    salary_given = paymentAmount;
  }

  const { base_pay, overtime_pay, total_pay } = calculatePayroll({
    monthly_salary: monthlySalary,
    paid_leave_days: paidLeaveDays,
    days_absent,
    days_half: 0,
    overtime_total_units,
    overtime_rate: overtimeRate,
  });

  const { monthly_balance, closing_balance } = calculateBalance(
    total_pay,
    salary_given,
    previousBalance
  );

  await prisma.payrollSummary.upsert({
    where: {
      employee_id_month_year: { employee_id: employeeId, month, year },
    },
    create: {
      employee_id: employeeId,
      month,
      year,
      days_present,
      days_absent,
      paid_leave_days: paidLeaveDays,
      base_pay,
      overtime_total_units,
      overtime_rate_snapshot: overtimeRate,
      overtime_pay,
      allowance_rate_snapshot: 0,
      allowance_pay: 0,
      total_pay,
      salary_given,
      previous_balance: previousBalance,
      monthly_balance,
      closing_balance,
    },
    update: {
      days_present,
      days_absent,
      paid_leave_days: paidLeaveDays,
      base_pay,
      overtime_total_units,
      overtime_rate_snapshot: overtimeRate,
      overtime_pay,
      allowance_rate_snapshot: 0,
      allowance_pay: 0,
      total_pay,
      salary_given,
      previous_balance: previousBalance,
      monthly_balance,
      closing_balance,
    },
  });

  return closing_balance;
}

async function ensureBootstrap(
  supabaseAdmin: AdminClient
): Promise<{ orgId: string; admin: Profile; mainOutlet: Outlet }> {
  const orgName = process.env.INITIAL_ORG_NAME || "Acme Retail Pvt Ltd";
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@example.com";
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "Admin@123456";

  let org = await prisma.organization.findFirst();
  if (!org) {
    console.log(`Creating organization: ${orgName}`);
    org = await prisma.organization.create({ data: { name: orgName } });
  } else {
    console.log(`Using existing organization: ${org.name}`);
  }

  let admin = await prisma.profile.findFirst({
    where: { org_id: org.id, role: "admin" },
  });

  if (!admin) {
    console.log(`Creating admin user (${adminEmail} / ${adminUsername})...`);
    const authUser = await ensureAuthUser(supabaseAdmin, adminEmail, adminPassword);
    admin = await prisma.profile.upsert({
      where: { id: authUser.id },
      create: {
        id: authUser.id,
        org_id: org.id,
        email: adminEmail.toLowerCase(),
        username: adminUsername.toLowerCase(),
        role: "admin",
      },
      update: {
        org_id: org.id,
        email: adminEmail.toLowerCase(),
        username: adminUsername.toLowerCase(),
        role: "admin",
      },
    });
  } else {
    console.log(`Using existing admin: ${admin.username}`);
  }

  let mainOutlet = await prisma.outlet.findFirst({
    where: { org_id: org.id, name: "Main Outlet" },
  });
  if (!mainOutlet) {
    mainOutlet = await prisma.outlet.create({
      data: {
        org_id: org.id,
        name: "Main Outlet",
        overtime_rate: 100,
        overtime_unit: "hour",
      },
    });
    console.log("Created outlet: Main Outlet");
  }

  return { orgId: org.id, admin, mainOutlet };
}

async function ensureStaffUser(
  supabaseAdmin: AdminClient,
  orgId: string
) {
  const email = process.env.INITIAL_STAFF_EMAIL || "staff@example.com";
  const username = process.env.INITIAL_STAFF_USERNAME || "staff";
  const password = process.env.INITIAL_STAFF_PASSWORD || "Staff@123456";

  const existing = await prisma.profile.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    console.log(`Using existing staff: ${existing.username}`);
    return { profile: existing, password, created: false };
  }

  console.log(`Creating staff user (${email} / ${username})...`);
  const authUser = await ensureAuthUser(supabaseAdmin, email, password);
  const profile = await prisma.profile.create({
    data: {
      id: authUser.id,
      org_id: orgId,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      role: "staff",
    },
  });
  return { profile, password, created: true };
}

async function seedDemoData(orgId: string, admin: Profile, mainOutlet: Outlet) {
  const employeeCount = await prisma.employee.count({
    where: { outlet: { org_id: orgId } },
  });
  if (employeeCount > 0) {
    console.log(
      `Found ${employeeCount} employee(s) already — skipping demo employees/attendance/payroll.`
    );
    console.log("Delete employees (or reset DB) and re-run seed to regenerate demo data.");
    return false;
  }

  console.log("Seeding demo outlets, employees, attendance, payroll, and payments...");

  const warehouse =
    (await prisma.outlet.findFirst({
      where: { org_id: orgId, name: "Warehouse North" },
    })) ??
    (await prisma.outlet.create({
      data: {
        org_id: orgId,
        name: "Warehouse North",
        overtime_rate: 150,
        overtime_unit: "hour",
      },
    }));

  const cafe =
    (await prisma.outlet.findFirst({
      where: { org_id: orgId, name: "Cafe Downtown" },
    })) ??
    (await prisma.outlet.create({
      data: {
        org_id: orgId,
        name: "Cafe Downtown",
        overtime_rate: 500,
        overtime_unit: "day",
      },
    }));

  const mainEmployees: DemoEmployee[] = [
    {
      name: "Priya Sharma",
      monthly_salary: 35000,
      paid_leave_days: 2,
      absentDays: [5, 18],
      overtimeDays: { 3: 2, 10: 1.5, 22: 3 },
    },
    {
      name: "Rahul Verma",
      monthly_salary: 28000,
      paid_leave_days: 1,
      absentDays: [12],
      overtimeDays: { 7: 1, 14: 2 },
    },
    {
      name: "Ananya Iyer",
      monthly_salary: 42000,
      paid_leave_days: 3,
      absentDays: [],
      overtimeDays: { 4: 2, 11: 2, 25: 4 },
    },
  ];

  const warehouseEmployees: DemoEmployee[] = [
    {
      name: "Vikram Singh",
      monthly_salary: 22000,
      paid_leave_days: 1,
      absentDays: [8, 9, 23],
      overtimeDays: { 2: 3, 16: 2 },
    },
    {
      name: "Meera Patel",
      monthly_salary: 25000,
      paid_leave_days: 2,
      absentDays: [15],
      overtimeDays: { 6: 1, 20: 2.5 },
    },
  ];

  const cafeEmployees: DemoEmployee[] = [
    {
      name: "Arjun Nair",
      monthly_salary: 18000,
      paid_leave_days: 0,
      absentDays: [3, 17, 24],
      overtimeDays: { 8: 1, 21: 1 },
    },
    {
      name: "Sneha Reddy",
      monthly_salary: 20000,
      paid_leave_days: 1,
      absentDays: [11],
      overtimeDays: { 5: 1, 19: 1 },
    },
  ];

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const groups: { outlet: Outlet; employees: DemoEmployee[] }[] = [
    { outlet: mainOutlet, employees: mainEmployees },
    { outlet: warehouse, employees: warehouseEmployees },
    { outlet: cafe, employees: cafeEmployees },
  ];

  for (const { outlet, employees } of groups) {
    const otRate = Number(outlet.overtime_rate);

    for (const emp of employees) {
      const created = await prisma.employee.create({
        data: {
          outlet_id: outlet.id,
          name: emp.name,
          monthly_salary: emp.monthly_salary,
          paid_leave_days: emp.paid_leave_days,
        },
      });

      // Previous month — fully paid (balance carries / clears)
      const prevClosing = await seedAttendanceAndPayroll(
        created.id,
        emp.monthly_salary,
        emp.paid_leave_days,
        otRate,
        prevYear,
        prevMonth,
        emp.absentDays.map((d) => Math.min(d, daysInMonth(prevYear, prevMonth))),
        emp.overtimeDays,
        admin.id,
        emp.monthly_salary, // paid full base-ish; OT may leave small balance
        0
      );

      // Current month — partial payment so balances show up
      const partialPay = Math.round(emp.monthly_salary * 0.6);
      await seedAttendanceAndPayroll(
        created.id,
        emp.monthly_salary,
        emp.paid_leave_days,
        otRate,
        currentYear,
        currentMonth,
        emp.absentDays.map((d) => Math.min(d, daysInMonth(currentYear, currentMonth))),
        emp.overtimeDays,
        admin.id,
        partialPay,
        prevClosing
      );

      await prisma.auditLog.create({
        data: {
          org_id: orgId,
          user_id: admin.id,
          entity_type: "Employee",
          entity_id: created.id,
          field_changed: "name",
          old_value: null,
          new_value: emp.name,
        },
      });
    }
  }

  console.log(
    `Seeded ${mainEmployees.length + warehouseEmployees.length + cafeEmployees.length} employees across 3 outlets.`
  );
  return true;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { orgId, admin, mainOutlet } = await ensureBootstrap(supabaseAdmin);
  const staff = await ensureStaffUser(supabaseAdmin, orgId);
  const demoSeeded = await seedDemoData(orgId, admin, mainOutlet);

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  console.log("\n==========================================");
  console.log("✓ Seed complete");
  console.log("------------------------------------------");
  console.log(`Organization: ${org.name}`);
  console.log(`Admin login:  ${admin.username} / ${process.env.INITIAL_ADMIN_PASSWORD || "Admin@123456"}`);
  console.log(`Staff login:  ${staff.profile.username} / ${staff.password}`);
  if (demoSeeded) {
    console.log("Demo data:    3 outlets, 7 employees, 2 months attendance/payroll/payments");
  }
  console.log("==========================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
