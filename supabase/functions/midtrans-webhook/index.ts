import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";
import { synchronizeMidtransStatus } from "../_shared/midtrans.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json() as { order_id?: string; kopipow_order_id?: string };
    if (!body.order_id && !body.kopipow_order_id) {
      return jsonResponse({ error: "Missing payment order ID." }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let providerOrderId = body.order_id ?? null;
    if (body.kopipow_order_id) {
      if (!/^[0-9a-f-]{36}$/i.test(body.kopipow_order_id)) {
        return jsonResponse({ error: "Invalid KopiPow order ID." }, 400);
      }
      const { data: attempt, error } = await serviceClient
        .from("payment_attempts")
        .select("provider_order_id")
        .eq("order_id", body.kopipow_order_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      providerOrderId = attempt?.provider_order_id ?? null;
    }

    if (!providerOrderId) return jsonResponse({ received: true, matched: false });
    const result = await synchronizeMidtransStatus(serviceClient, providerOrderId);

    // Unknown IDs are acknowledged so Midtrans does not repeatedly retry an unrelated event.
    return jsonResponse({ received: true, matched: Boolean(result) });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
