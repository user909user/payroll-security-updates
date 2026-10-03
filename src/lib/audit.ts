import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogParams {
  org_id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  field_changed?: string;
  old_value?: string | null;
  new_value?: string | null;
  highlighted?: boolean;
  outlet_id?: string | null;
}

export async function logAudit(params: AuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        org_id: params.org_id,
        outlet_id: params.outlet_id ?? null,
        user_id: params.user_id,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        field_changed: params.field_changed ?? null,
        old_value:
          params.old_value !== undefined
            ? String(params.old_value ?? "")
            : null,
        new_value:
          params.new_value !== undefined
            ? String(params.new_value ?? "")
            : null,
        highlighted: params.highlighted ?? false,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to write audit entry:", error);
  }
}

const PROFILE_SELECT = {
  id: true,
  org_id: true,
  email: true,
  username: true,
  role: true,
  outlet_id: true,
  outlet: { select: { id: true, name: true } },
} as const;

const getCachedProfile = unstable_cache(
  async (userId: string) =>
    prisma.profile.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    }),
  ["auth-profile-v3"],
  { revalidate: 60 }
);

/**
 * Authenticated profile for the current request.
 * Verifies the JWT locally (getClaims) instead of calling the Auth API,
 * and caches the Prisma profile for 60s.
 */
export const getAuthProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId || typeof userId !== "string") return null;
  return getCachedProfile(userId);
});

export function isAdmin(profile: { role: string } | null | undefined) {
  return profile?.role === "admin";
}

/** Staff may only access their assigned outlet; admins may access any org outlet. */
export function canAccessOutlet(
  profile: { role: string; outlet_id: string | null },
  outletId: string
) {
  if (profile.role === "admin") return true;
  return profile.outlet_id === outletId;
}
