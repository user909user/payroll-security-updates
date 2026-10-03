import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthProfile, logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/users — list org users (admin only)
export async function GET() {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.profile.findMany({
    where: { org_id: profile.org_id },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      outlet_id: true,
      created_at: true,
      outlet: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(users, {
    headers: { "Cache-Control": "private, max-age=20, stale-while-revalidate=60" },
  });
}

// POST /api/users — create a staff/admin user (admin only)
export async function POST(request: Request) {
  const profile = await getAuthProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { email, username, password, role, outlet_id } = body;

  if (!email || !username || !password) {
    return NextResponse.json({ error: "email, username, and password are required" }, { status: 400 });
  }

  const allowedRoles = ["admin", "staff"];
  const userRole = allowedRoles.includes(role) ? role : "staff";

  if (userRole === "staff" && !outlet_id) {
    return NextResponse.json(
      { error: "Staff users must be assigned to an outlet" },
      { status: 400 }
    );
  }

  if (outlet_id) {
    const outlet = await prisma.outlet.findFirst({
      where: { id: outlet_id, org_id: profile.org_id },
    });
    if (!outlet) return NextResponse.json({ error: "Outlet not found" }, { status: 404 });
  }

  const existing = await prisma.profile.findUnique({ where: { username: username.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const supabaseAdmin = await createAdminClient();
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Failed to create auth user" },
      { status: 400 }
    );
  }

  try {
    const newProfile = await prisma.profile.create({
      data: {
        id: authData.user.id,
        org_id: profile.org_id,
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        role: userRole,
        outlet_id: userRole === "staff" ? outlet_id : outlet_id || null,
      },
    });

    await logAudit({
      org_id: profile.org_id,
      user_id: profile.id,
      entity_type: "Profile",
      entity_id: newProfile.id,
      field_changed: "created",
      old_value: null,
      new_value: `User created: ${username} (${userRole})`,
    });

    return NextResponse.json(
      {
        id: newProfile.id,
        email: newProfile.email,
        username: newProfile.username,
        role: newProfile.role,
        outlet_id: newProfile.outlet_id,
      },
      { status: 201 }
    );
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw err;
  }
}
