import { createClient } from "npm:@supabase/supabase-js@2";
import { synchronizeMidtransStatus } from "../_shared/midtrans.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ORDER_PATTERN = /^KOPIPOW-[0-9a-f-]{36}$/i;

type CallbackPaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

const redirectToApp = (orderId: string | null, paymentStatus: CallbackPaymentStatus | null) => {
  const params = new URLSearchParams();
  if (orderId) params.set("order_id", orderId);
  if (paymentStatus) params.set("payment_status", paymentStatus);

  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      Location: `kopipow://payment/complete?${params.toString()}`,
    },
  });
};

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const kopipowOrderId = url.searchParams.get("kopipow_order_id") ?? "";
  const callbackOrderId = url.searchParams.get("order_id") ?? "";

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let attemptQuery = serviceClient
      .from("payment_attempts")
      .select("order_id, provider_order_id")
      .order("created_at", { ascending: false })
      .limit(1);

    if (PROVIDER_ORDER_PATTERN.test(callbackOrderId)) {
      attemptQuery = attemptQuery.eq("provider_order_id", callbackOrderId);
    } else {
      const internalOrderId = UUID_PATTERN.test(kopipowOrderId)
        ? kopipowOrderId
        : UUID_PATTERN.test(callbackOrderId)
          ? callbackOrderId
          : null;
      if (!internalOrderId) return redirectToApp(null, null);
      attemptQuery = attemptQuery.eq("order_id", internalOrderId);
    }

    const { data: attempt, error } = await attemptQuery.maybeSingle();
    if (error) throw error;
    if (!attempt) return redirectToApp(null, null);

    const result = await synchronizeMidtransStatus(serviceClient, attempt.provider_order_id);
    return redirectToApp(
      attempt.order_id,
      result?.paymentStatus as CallbackPaymentStatus | null ?? null,
    );
  } catch {
    // The authenticated app check and Midtrans webhook remain independent
    // recovery paths. Do not expose provider or database errors publicly.
    return redirectToApp(null, null);
  }
});
