import { supabase } from "./supabase";

export type AppRole = "customer" | "staff" | "admin";

export type AppAccess = {
  role: AppRole;
  branchId: string | null;
  enabled: boolean;
};

export const CUSTOMER_ACCESS: AppAccess = {
  role: "customer",
  branchId: null,
  enabled: true,
};

type UserRoleRow = {
  role: "staff" | "admin";
  branch_id: string | null;
  enabled: boolean;
};

export async function loadAppAccess(userId: string): Promise<{
  access: AppAccess;
  error: string | null;
}> {
  if (!supabase) {
    return { access: CUSTOMER_ACCESS, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role, branch_id, enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Existing customer builds can keep working while the role migration is
    // being deployed. No database row must ever grant elevated access.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { access: CUSTOMER_ACCESS, error: null };
    }
    return { access: CUSTOMER_ACCESS, error: error.message };
  }

  const row = data as UserRoleRow | null;
  if (!row || !row.enabled) return { access: CUSTOMER_ACCESS, error: null };

  return {
    access: {
      role: row.role,
      branchId: row.branch_id,
      enabled: row.enabled,
    },
    error: null,
  };
}
