import { supabase } from "./supabase";

export type OnlinePaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

export type PaymentSession = {
  orderId: string;
  paymentUrl: string;
  paymentStatus: OnlinePaymentStatus;
};

export type PaymentStatusResult = {
  orderId: string;
  paymentStatus: OnlinePaymentStatus;
  paymentType: string | null;
  transactionStatus: string;
};

type PaymentResult<T> = {
  data: T | null;
  error: string | null;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isTemporaryFunctionFailure = (message: string) => (
  /failed to send a request|abort|network|timed? out|fetch/i.test(message)
);

export type PaymentGateway = {
  id: "midtrans";
  createSession: (orderId: string) => Promise<PaymentResult<PaymentSession>>;
  synchronizeStatus: (orderId: string) => Promise<PaymentResult<PaymentStatusResult>>;
};

const getFunctionError = async (error: unknown) => {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: string };
        if (body.error) return body.error;
      } catch {
        // Fall back to the SDK error message below.
      }
    }
  }
  return error instanceof Error ? error.message : "The payment service could not be reached.";
};

const invokePaymentFunction = async <T>(name: string, orderId: string): Promise<PaymentResult<T>> => {
  if (!supabase) return { data: null, error: "Supabase is not configured." };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase.functions.invoke(name, {
      body: { orderId },
    });
    if (!error) return { data: data as T, error: null };

    const message = await getFunctionError(error);
    if (attempt === 1 || !isTemporaryFunctionFailure(message)) {
      return { data: null, error: message };
    }
    await wait(650);
  }

  return { data: null, error: "The payment service could not be reached." };
};

const midtransGateway: PaymentGateway = {
  id: "midtrans",

  async createSession(orderId) {
    return invokePaymentFunction<PaymentSession>("midtrans-create-transaction", orderId);
  },

  async synchronizeStatus(orderId) {
    return invokePaymentFunction<PaymentStatusResult>("midtrans-sync-status", orderId);
  },
};

// Keep checkout coupled to this interface—not Midtrans internals—so another
// payment provider can replace it later without rebuilding the order flow.
export const paymentGateway: PaymentGateway = midtransGateway;
