import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MIDTRANS_TIMEOUT_MS = 15_000;

export type MidtransEnvironment = "sandbox" | "production";

export type MidtransTransactionStatus = {
  order_id?: string;
  transaction_id?: string;
  transaction_status?: string;
  payment_type?: string;
  fraud_status?: string;
  gross_amount?: string;
  status_code?: string;
  status_message?: string;
  signature_key?: string;
  [key: string]: unknown;
};

type PaymentAttempt = {
  id: string;
  order_id: string;
  gross_amount: number;
  provider_order_id: string;
};

const getMidtransConfig = () => {
  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY")?.trim();
  if (!serverKey) throw new Error("Midtrans is not configured on the server yet.");

  const environment: MidtransEnvironment = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "production"
    : "sandbox";

  return {
    environment,
    serverKey,
    appBaseUrl: environment === "production"
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com",
    apiBaseUrl: environment === "production"
      ? "https://api.midtrans.com"
      : "https://api.sandbox.midtrans.com",
  };
};

const midtransFetch = async (url: string, serverKey: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MIDTRANS_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${serverKey}:`)}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const createSnapTransaction = async (payload: Record<string, unknown>) => {
  const config = getMidtransConfig();
  const response = await midtransFetch(
    `${config.appBaseUrl}/snap/v1/transactions`,
    config.serverKey,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  const data = await response.json() as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };

  if (!response.ok || !data.token || !data.redirect_url) {
    throw new Error(data.error_messages?.[0] ?? `Midtrans returned HTTP ${response.status}.`);
  }

  return {
    environment: config.environment,
    redirectUrl: data.redirect_url,
    token: data.token,
  };
};

export const cancelSnapSession = async (token: string) => {
  const config = getMidtransConfig();
  const response = await midtransFetch(
    `${config.appBaseUrl}/snap/v1/transactions/${encodeURIComponent(token)}/cancel`,
    config.serverKey,
    { method: "POST" },
  );
  const data = await response.json() as {
    canceled_at?: string;
    error_messages?: string[];
  };
  const alreadyCancelled = data.error_messages?.some((message) => (
    message.toLowerCase().includes("already canceled")
  ));

  if (!response.ok || (!data.canceled_at && !alreadyCancelled)) {
    throw new Error(data.error_messages?.[0] ?? `Midtrans returned HTTP ${response.status}.`);
  }

  return data;
};

export const getMidtransTransactionStatus = async (providerOrderId: string) => {
  const config = getMidtransConfig();
  const response = await midtransFetch(
    `${config.apiBaseUrl}/v2/${encodeURIComponent(providerOrderId)}/status`,
    config.serverKey,
    { method: "GET" },
  );
  const data = await response.json() as MidtransTransactionStatus;

  if (!response.ok) {
    throw new Error(data.status_message ?? `Midtrans returned HTTP ${response.status}.`);
  }

  return data;
};

const mapMidtransStatus = (status: MidtransTransactionStatus) => {
  const transactionStatus = status.transaction_status ?? "pending";

  if (transactionStatus === "settlement") return { attempt: "paid", order: "paid" } as const;
  if (transactionStatus === "capture") {
    return status.fraud_status === "accept"
      ? { attempt: "paid", order: "paid" } as const
      : { attempt: "pending", order: "pending" } as const;
  }
  if (transactionStatus === "expire") return { attempt: "expired", order: "expired" } as const;
  if (transactionStatus === "cancel") return { attempt: "cancelled", order: "failed" } as const;
  if (["deny", "failure"].includes(transactionStatus)) return { attempt: "failed", order: "failed" } as const;
  if (["refund", "partial_refund"].includes(transactionStatus)) return { attempt: "refunded", order: "refunded" } as const;
  return { attempt: "pending", order: "pending" } as const;
};

export const synchronizeMidtransStatus = async (
  serviceClient: SupabaseClient,
  providerOrderId: string,
) => {
  const { data: attemptData, error: attemptError } = await serviceClient
    .from("payment_attempts")
    .select("id, order_id, gross_amount, provider_order_id")
    .eq("provider_order_id", providerOrderId)
    .maybeSingle();

  if (attemptError) throw attemptError;
  if (!attemptData) return null;

  const attempt = attemptData as PaymentAttempt;
  const status = await getMidtransTransactionStatus(providerOrderId);
  const reportedAmount = Number(status.gross_amount);
  if (!Number.isFinite(reportedAmount) || reportedAmount !== Number(attempt.gross_amount)) {
    throw new Error("Midtrans returned an unexpected payment amount.");
  }

  const mapped = mapMidtransStatus(status);
  const now = new Date().toISOString();
  const { error: updateAttemptError } = await serviceClient
    .from("payment_attempts")
    .update({
      provider_transaction_id: status.transaction_id ?? null,
      status: mapped.attempt,
      payment_type: status.payment_type ?? null,
      raw_status: status,
      updated_at: now,
    })
    .eq("id", attempt.id);
  if (updateAttemptError) throw updateAttemptError;

  const { data: orderData, error: orderReadError } = await serviceClient
    .from("orders")
    .select("status")
    .eq("id", attempt.order_id)
    .single();
  if (orderReadError) throw orderReadError;

  const orderUpdate: Record<string, unknown> = {
    payment_status: mapped.order,
    updated_at: now,
  };
  if (mapped.order === "paid") {
    orderUpdate.paid_at = now;
    if (["pending", "cancelled"].includes(orderData.status)) orderUpdate.status = "confirmed";
  } else if (["failed", "expired"].includes(mapped.order) && orderData.status === "pending") {
    orderUpdate.status = "cancelled";
  }

  const { error: updateOrderError } = await serviceClient
    .from("orders")
    .update(orderUpdate)
    .eq("id", attempt.order_id);
  if (updateOrderError) throw updateOrderError;

  return {
    orderId: attempt.order_id,
    paymentStatus: mapped.order,
    paymentType: status.payment_type ?? null,
    transactionStatus: status.transaction_status ?? "pending",
  };
};

export const getPaymentEnvironment = () => getMidtransConfig().environment;
