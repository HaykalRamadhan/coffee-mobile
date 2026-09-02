import { createClient } from "@supabase/supabase-js";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";

const activeOrderStatuses = ["pending", "confirmed", "preparing", "ready"];
const activePaymentStatuses = ["created", "pending"];

const requireEnvironmentValue = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured for this function.`);
  return value;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requireEnvironmentValue("SUPABASE_URL");
    const anonKey = requireEnvironmentValue("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Authentication is required." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Your session is not valid. Sign in again and retry." }, 401);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const userId = userData.user.id;

    const [{ data: activeOrder, error: orderError }, { data: activePayment, error: paymentError }] = await Promise.all([
      serviceClient
        .from("orders")
        .select("id, status")
        .eq("user_id", userId)
        .in("status", activeOrderStatuses)
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("payment_attempts")
        .select("id, status")
        .eq("user_id", userId)
        .in("status", activePaymentStatuses)
        .limit(1)
        .maybeSingle(),
    ]);
    if (orderError) throw orderError;
    if (paymentError) throw paymentError;
    if (activeOrder) {
      return jsonResponse({
        error: `An order is still marked ${activeOrder.status}. Make sure it is completed or cancelled before deleting your account.`,
      }, 409);
    }
    if (activePayment) {
      return jsonResponse({
        error: `A Midtrans payment attempt is still marked ${activePayment.status}. Check or cancel that payment before deleting your account.`,
      }, 409);
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
