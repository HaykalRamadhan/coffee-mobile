import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";
import {
  cancelMidtransTransaction,
  getMidtransTransactionStatus,
  synchronizeMidtransStatus,
} from "../_shared/midtrans.ts";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

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
    if (!body.orderId || !UUID_PATTERN.test(body.orderId)) {
      return jsonResponse({ error: "A valid order is required." }, 400);
    }

    const { data: order, error: orderError } = await userClient
      .from("orders")
      .select("id, status, payment_method, payment_status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return jsonResponse({ error: "Order not found." }, 404);
    if (order.payment_method !== "midtrans_snap") {
      return jsonResponse({ error: "This order does not use Midtrans." }, 409);
    }
    if (order.status !== "pending") {
      return jsonResponse({ error: "Only pending orders can have their payment cancelled." }, 409);
    }
    if (order.payment_status === "paid" || order.payment_status === "refunded") {
      return jsonResponse({ error: "A completed payment cannot be cancelled. Use a refund instead." }, 409);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: attempt, error: attemptError } = await serviceClient
      .from("payment_attempts")
      .select("id, provider_order_id, status")
      .eq("order_id", order.id)
      .in("status", ["created", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return jsonResponse({ error: "No active payment attempt exists for this order." }, 404);

    const currentStatus = await getMidtransTransactionStatus(attempt.provider_order_id);
    if (["capture", "settlement"].includes(currentStatus.transaction_status ?? "")) {
      return jsonResponse({ error: "The payment has completed and cannot be cancelled. Use a refund instead." }, 409);
    }

    await cancelMidtransTransaction(attempt.provider_order_id);
    const result = await synchronizeMidtransStatus(serviceClient, attempt.provider_order_id);
    if (!result) return jsonResponse({ error: "Payment attempt not found." }, 404);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 502);
  }
});
