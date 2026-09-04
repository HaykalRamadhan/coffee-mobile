import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";

const value = (name: string) => {
  const result = Deno.env.get(name)?.trim();
  if (!result) throw new Error(`${name} is not configured.`);
  return result;
};

const listStaff = async (admin: ReturnType<typeof createClient>) => {
  const { data: roles, error } = await admin.from("user_roles")
    .select("user_id, role, branch_id, enabled, created_at").order("created_at");
  if (error) throw error;
  return Promise.all((roles ?? []).map(async (role) => {
    const { data, error: userError } = await admin.auth.admin.getUserById(role.user_id);
    if (userError) throw userError;
    return {
      userId: role.user_id, email: data.user?.email ?? "",
      displayName: String(data.user?.user_metadata?.display_name ?? data.user?.user_metadata?.full_name ?? ""),
      role: role.role, branchId: role.branch_id, enabled: role.enabled, createdAt: role.created_at,
    };
  }));
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Authentication is required." }, 401);
    const url = value("SUPABASE_URL");
    const userClient = createClient(url, value("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: caller, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller.user) return jsonResponse({ error: "Your session is invalid." }, 401);
    const admin = createClient(url, value("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: access } = await admin.from("user_roles").select("role, enabled").eq("user_id", caller.user.id).maybeSingle();
    if (!access?.enabled || access.role !== "admin") return jsonResponse({ error: "Admin access is required." }, 403);

    const body = await request.json() as { action?: string; userId?: string; staff?: Record<string, unknown> };
    if (body.action === "list") return jsonResponse({ staff: await listStaff(admin) });
    if (body.action === "delete") {
      if (!body.userId || body.userId === caller.user.id) return jsonResponse({ error: "You cannot remove your own admin access." }, 400);
      const { error } = await admin.from("user_roles").delete().eq("user_id", body.userId);
      if (error) throw error;
      return jsonResponse({ staff: await listStaff(admin) });
    }

    const staff = body.staff ?? {};
    const email = String(staff.email ?? "").trim().toLowerCase();
    const displayName = String(staff.displayName ?? "").trim();
    const role = staff.role === "admin" ? "admin" : "staff";
    const branchId = role === "staff" ? String(staff.branchId ?? "") || null : null;
    const enabled = staff.enabled !== false;
    if (!email || !email.includes("@")) return jsonResponse({ error: "Enter a valid staff email." }, 400);
    if (role === "staff" && !branchId) return jsonResponse({ error: "Choose a branch for staff members." }, 400);

    let userId = String(staff.userId ?? "");
    if (body.action === "create") {
      const password = String(staff.password ?? "");
      if (password.length < 8) return jsonResponse({ error: "Temporary password must contain at least 8 characters." }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
      if (error || !data.user) throw error ?? new Error("Staff account was not created.");
      userId = data.user.id;
    } else if (body.action === "update" && userId) {
      const attributes: { email: string; password?: string; user_metadata: { display_name: string } } = { email, user_metadata: { display_name: displayName } };
      const password = String(staff.password ?? "");
      if (password) {
        if (password.length < 8) return jsonResponse({ error: "New password must contain at least 8 characters." }, 400);
        attributes.password = password;
      }
      const { error } = await admin.auth.admin.updateUserById(userId, attributes);
      if (error) throw error;
    } else return jsonResponse({ error: "Unsupported staff action." }, 400);

    const { error: roleError } = await admin.from("user_roles").upsert({ user_id: userId, role, branch_id: branchId, enabled, updated_at: new Date().toISOString() });
    if (roleError) {
      if (body.action === "create") await admin.auth.admin.deleteUser(userId);
      throw roleError;
    }
    return jsonResponse({ staff: await listStaff(admin) });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
