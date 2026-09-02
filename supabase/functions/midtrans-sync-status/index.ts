import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";
import { synchronizeMidtransStatus } from "../_shared/midtrans.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "Authentication is required." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Your session is not valid." }, 401);

    const body = await request.json() as { orderId?: string };
    if (!body.orderId || !/^[0-9a-f-]{36}$/i.test(body.orderId)) {
      return jsonResponse({ error: "A valid order is required." }, 400);
    }

    const { data: order, error: orderError } = await userClient
      .from("orders")
      .select("id")
      .eq("id", body.orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return jsonResponse({ error: "Order not found." }, 404);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: attempt, error: attemptError } = await serviceClient
      .from("payment_attempts")
      .select("provider_order_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return jsonResponse({ error: "No payment attempt exists for this order." }, 404);

    const result = await synchronizeMidtransStatus(serviceClient, attempt.provider_order_id);
    if (!result) return jsonResponse({ error: "Payment attempt not found." }, 404);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 502);
  }
});
