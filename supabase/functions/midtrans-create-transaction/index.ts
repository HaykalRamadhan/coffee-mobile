import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";
import { cancelSnapSession, createSnapTransaction, getPaymentEnvironment } from "../_shared/midtrans.ts";

type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_environment: "sandbox" | "production" | null;
  customer_name: string;
  phone: string | null;
  total: number;
  currency: string;
  order_items: Array<{
    id: number;
    product_id: number;
    product_name: string;
    unit_price: number;
    quantity: number;
  }>;
};

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

    const { data: orderData, error: orderError } = await userClient
      .from("orders")
      .select(`
        id, user_id, status, payment_method, payment_status, payment_environment, customer_name, phone, total, currency,
        order_items (id, product_id, product_name, unit_price, quantity)
      `)
      .eq("id", body.orderId)
      .single();

    if (orderError || !orderData) return jsonResponse({ error: "Order not found." }, 404);
    const order = orderData as OrderRow;
    if (order.payment_method !== "midtrans_snap") {
      return jsonResponse({ error: "This order does not use Midtrans." }, 409);
    }
    if (order.status !== "pending") {
      return jsonResponse({ error: "Cancelled or closed orders cannot start another payment." }, 409);
    }
    if (order.payment_status !== "pending") {
      return jsonResponse({ error: "This order is not eligible for another payment." }, 409);
    }
    if (["paid", "refunded"].includes(order.payment_status)) {
      return jsonResponse({ error: "This order cannot start another payment." }, 409);
    }
    if (order.currency !== "IDR" || Number(order.total) <= 0 || order.order_items.length === 0) {
      return jsonResponse({ error: "The order amount is invalid." }, 409);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const environment = getPaymentEnvironment();
    if (order.payment_environment && order.payment_environment !== environment) {
      return jsonResponse({
        error: `This ${order.payment_environment} order cannot be paid in ${environment}.`,
      }, 409);
    }
    if (!order.payment_environment) {
      const { error: environmentError } = await serviceClient
        .from("orders")
        .update({ payment_environment: environment, updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .is("payment_environment", null);
      if (environmentError) throw environmentError;
    }

    const { data: reusableAttempt } = await serviceClient
      .from("payment_attempts")
      .select("id, redirect_url, status")
      .eq("order_id", order.id)
      .eq("environment", environment)
      .in("status", ["created", "pending"])
      .not("redirect_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reusableAttempt?.redirect_url) {
      return jsonResponse({
        orderId: order.id,
        paymentUrl: reusableAttempt.redirect_url,
        paymentStatus: "pending",
        reused: true,
      });
    }

    const attemptId = crypto.randomUUID();
    const providerOrderId = `KOPIPOW-${attemptId}`;
    const { error: insertAttemptError } = await serviceClient
      .from("payment_attempts")
      .insert({
        id: attemptId,
        order_id: order.id,
        user_id: userData.user.id,
        provider: "midtrans",
        environment,
        provider_order_id: providerOrderId,
        status: "created",
        gross_amount: Number(order.total),
      });
    if (insertAttemptError) throw insertAttemptError;

    const finishUrl = `${supabaseUrl}/functions/v1/midtrans-finish?order_id=${encodeURIComponent(order.id)}`;
    try {
      const snap = await createSnapTransaction({
        transaction_details: {
          order_id: providerOrderId,
          gross_amount: Number(order.total),
        },
        item_details: order.order_items.map((item) => ({
          id: `${item.product_id}-${item.id}`.slice(0, 50),
          price: Number(item.unit_price),
          quantity: Number(item.quantity),
          name: item.product_name.slice(0, 50),
          brand: "KopiPow",
          category: "Food & Beverage",
        })),
        customer_details: {
          first_name: order.customer_name.slice(0, 50),
          email: userData.user.email,
          phone: order.phone ?? undefined,
        },
        credit_card: { secure: true },
        callbacks: { finish: finishUrl },
      });

      // The database trigger validates eligibility at insert time. Check once
      // more after the external request so a concurrently closed order never
      // receives a usable Snap page.
      const { data: latestOrder, error: latestOrderError } = await serviceClient
        .from("orders")
        .select("status, payment_status")
        .eq("id", order.id)
        .single();
      if (latestOrderError) throw latestOrderError;
      if (latestOrder.status !== "pending" || latestOrder.payment_status !== "pending") {
        await cancelSnapSession(snap.token);
        await serviceClient
          .from("payment_attempts")
          .update({
            status: "cancelled",
            raw_status: { snap_session_cancelled: true, reason: "order_closed_during_creation" },
            updated_at: new Date().toISOString(),
          })
          .eq("id", attemptId);
        return jsonResponse({ error: "This order was closed before payment could begin." }, 409);
      }

      const { error: updateAttemptError } = await serviceClient
        .from("payment_attempts")
        .update({
          status: "pending",
          snap_token: snap.token,
          redirect_url: snap.redirectUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", attemptId);
      if (updateAttemptError) throw updateAttemptError;

      return jsonResponse({
        orderId: order.id,
        paymentUrl: snap.redirectUrl,
        paymentStatus: "pending",
        reused: false,
      }, 201);
    } catch (error) {
      await serviceClient
        .from("payment_attempts")
        .update({
          status: "failed",
          raw_status: { create_error: getErrorMessage(error) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", attemptId);
      throw error;
    }
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 502);
  }
});
