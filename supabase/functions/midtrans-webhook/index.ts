import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getErrorMessage, jsonResponse } from "../_shared/http.ts";
import { synchronizeMidtransStatus } from "../_shared/midtrans.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json() as { order_id?: string };
    if (!body.order_id) return jsonResponse({ error: "Missing Midtrans order ID." }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const result = await synchronizeMidtransStatus(serviceClient, body.order_id);

    // Unknown IDs are acknowledged so Midtrans does not repeatedly retry an unrelated event.
    return jsonResponse({ received: true, matched: Boolean(result) });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
