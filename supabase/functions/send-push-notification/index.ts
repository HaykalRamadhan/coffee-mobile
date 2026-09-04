import { createClient } from "npm:@supabase/supabase-js@2.112.3";

type OutboxJob = {
  id: number;
  user_id: string;
  category: "order" | "news" | "general";
  title: string;
  body: string;
  data: Record<string, unknown>;
};

type DeviceRow = {
  id: string;
  expo_push_token: string;
};

type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoReceipt = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

const requiredValue = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const shortError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
};

const preferenceColumn = (category: OutboxJob["category"]) => {
  if (category === "order") return "order_updates_enabled";
  if (category === "news") return "news_enabled";
  return "general_enabled";
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const admin = createClient(
    requiredValue("SUPABASE_URL"),
    requiredValue("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const suppliedSecret = request.headers.get("x-push-worker-key")?.trim() ?? "";
  const { data: isAuthorized, error: authorizationError } = await admin.rpc(
    "verify_push_worker_secret",
    { p_secret: suppliedSecret },
  );
  if (authorizationError) {
    console.error("Push worker authorization failed", authorizationError.message);
    return jsonResponse({ error: "Worker authorization is unavailable." }, 503);
  }
  if (!isAuthorized) return jsonResponse({ error: "Unauthorized." }, 401);

  let accepted = 0;
  let failed = 0;
  let skipped = 0;
  let receiptsChecked = 0;

  const { data: jobs, error: claimError } = await admin.rpc(
    "claim_notification_outbox",
    { p_limit: 50 },
  );
  if (claimError) {
    console.error("Unable to claim notification jobs", claimError.message);
    return jsonResponse({ error: "Unable to claim notification jobs." }, 500);
  }

  for (const job of (jobs ?? []) as OutboxJob[]) {
    try {
      const { data: previousDeliveries, error: previousError } = await admin
        .from("push_notification_deliveries")
        .select("expo_push_token")
        .eq("outbox_id", job.id);
      if (previousError) throw previousError;

      const alreadyAttempted = new Set(
        (previousDeliveries ?? []).map((delivery) => String(delivery.expo_push_token)),
      );
      const { data: devices, error: deviceError } = await admin
        .from("push_notification_devices")
        .select("id, expo_push_token")
        .eq("user_id", job.user_id)
        .eq("enabled", true)
        .eq(preferenceColumn(job.category), true);
      if (deviceError) throw deviceError;

      const recipients = ((devices ?? []) as DeviceRow[]).filter(
        (device) => !alreadyAttempted.has(device.expo_push_token),
      );

      if (recipients.length === 0) {
        const { error } = await admin.from("notification_outbox").update({
          processed_at: new Date().toISOString(),
          claimed_at: null,
          last_error: null,
        }).eq("id", job.id);
        if (error) throw error;
        skipped += 1;
        continue;
      }

      const messages = recipients.map((device) => ({
        to: device.expo_push_token,
        sound: "default",
        title: job.title,
        body: job.body,
        data: job.data ?? {},
        channelId: job.category === "order" ? "orders" : job.category,
        priority: "high",
      }));

      const expoResponse = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
      if (!expoResponse.ok) {
        throw new Error(`Expo Push API returned HTTP ${expoResponse.status}.`);
      }

      const expoBody = await expoResponse.json() as { data?: ExpoTicket[] | ExpoTicket };
      const tickets = Array.isArray(expoBody.data) ? expoBody.data : [expoBody.data ?? {}];
      const deliveryRows = recipients.map((device, index) => {
        const ticket = tickets[index] ?? {};
        const successful = ticket.status === "ok" && Boolean(ticket.id);
        if (successful) accepted += 1;
        else failed += 1;
        return {
          outbox_id: job.id,
          device_id: device.id,
          expo_push_token: device.expo_push_token,
          ticket_id: successful ? ticket.id : null,
          status: successful ? "accepted" : "error",
          error_code: successful ? null : ticket.details?.error ?? "ExpoPushError",
          error_message: successful ? null : (ticket.message ?? "Expo rejected the notification.").slice(0, 500),
          checked_at: successful ? null : new Date().toISOString(),
        };
      });

      const { error: deliveryError } = await admin
        .from("push_notification_deliveries")
        .upsert(deliveryRows, { onConflict: "outbox_id,expo_push_token" });
      if (deliveryError) throw deliveryError;

      for (let index = 0; index < tickets.length; index += 1) {
        if (tickets[index]?.details?.error === "DeviceNotRegistered") {
          await admin.from("push_notification_devices")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", recipients[index]?.id ?? "");
        }
      }

      const immediateErrors = deliveryRows
        .filter((delivery) => delivery.status === "error")
        .map((delivery) => delivery.error_code)
        .filter(Boolean)
        .join(", ");
      const { error: completeError } = await admin.from("notification_outbox").update({
        processed_at: new Date().toISOString(),
        claimed_at: null,
        last_error: immediateErrors || null,
      }).eq("id", job.id);
      if (completeError) throw completeError;
    } catch (error) {
      failed += 1;
      const message = shortError(error);
      console.error(`Notification job ${job.id} failed`, message);
      await admin.from("notification_outbox").update({
        claimed_at: null,
        last_error: message,
      }).eq("id", job.id);
    }
  }

  const receiptCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const receiptExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: deliveries, error: receiptQueryError } = await admin
    .from("push_notification_deliveries")
    .select("id, device_id, expo_push_token, ticket_id, created_at")
    .eq("status", "accepted")
    .is("checked_at", null)
    .lte("created_at", receiptCutoff)
    .order("created_at")
    .limit(1000);

  if (receiptQueryError) {
    console.error("Unable to query push receipts", receiptQueryError.message);
  } else if ((deliveries ?? []).length > 0) {
    const expired = deliveries!.filter((delivery) => delivery.created_at < receiptExpiry);
    const pending = deliveries!.filter((delivery) => delivery.created_at >= receiptExpiry);

    for (const delivery of expired) {
      await admin.from("push_notification_deliveries").update({
        status: "error",
        error_code: "ReceiptExpired",
        error_message: "No Expo push receipt was available within 24 hours.",
        checked_at: new Date().toISOString(),
      }).eq("id", delivery.id);
      receiptsChecked += 1;
    }

    if (pending.length > 0) {
      try {
        const receiptResponse = await fetch(EXPO_RECEIPTS_URL, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ ids: pending.map((delivery) => delivery.ticket_id) }),
        });
        if (!receiptResponse.ok) {
          throw new Error(`Expo receipt API returned HTTP ${receiptResponse.status}.`);
        }
        const receiptBody = await receiptResponse.json() as { data?: Record<string, ExpoReceipt> };
        for (const delivery of pending) {
          const receipt = receiptBody.data?.[String(delivery.ticket_id)];
          if (!receipt) continue;
          const delivered = receipt.status === "ok";
          await admin.from("push_notification_deliveries").update({
            status: delivered ? "delivered" : "error",
            error_code: delivered ? null : receipt.details?.error ?? "ExpoReceiptError",
            error_message: delivered ? null : (receipt.message ?? "Push delivery failed.").slice(0, 500),
            checked_at: new Date().toISOString(),
          }).eq("id", delivery.id);
          if (receipt.details?.error === "DeviceNotRegistered") {
            await admin.from("push_notification_devices").update({
              enabled: false,
              updated_at: new Date().toISOString(),
            }).eq("id", delivery.device_id ?? "");
          }
          receiptsChecked += 1;
        }
      } catch (error) {
        console.error("Push receipt check failed", shortError(error));
      }
    }
  }

  return jsonResponse({ ok: true, accepted, failed, skipped, receiptsChecked });
});
