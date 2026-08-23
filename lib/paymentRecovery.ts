import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OnlinePaymentStatus } from "./payments";

const PAYMENT_CHECKPOINTS_KEY = "kopipow.payment-checkpoints.v1";
const CHECKPOINT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export type PaymentCheckpointPhase = "preparing" | "awaiting_confirmation" | "verifying" | "paused";

export type PaymentCheckpoint = {
  orderId: string;
  userId: string;
  total: number;
  phase: PaymentCheckpointPhase;
  lastKnownStatus: OnlinePaymentStatus;
  updatedAt: string;
};

let checkpointMutationQueue: Promise<void> = Promise.resolve();

const isCheckpoint = (value: unknown): value is PaymentCheckpoint => {
  if (!value || typeof value !== "object") return false;
  const checkpoint = value as Partial<PaymentCheckpoint>;
  return typeof checkpoint.orderId === "string"
    && typeof checkpoint.userId === "string"
    && typeof checkpoint.total === "number"
    && typeof checkpoint.phase === "string"
    && typeof checkpoint.lastKnownStatus === "string"
    && typeof checkpoint.updatedAt === "string";
};

const readCheckpoints = async () => {
  try {
    const stored = await AsyncStorage.getItem(PAYMENT_CHECKPOINTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    const oldestAllowed = Date.now() - CHECKPOINT_MAX_AGE_MS;
    return parsed.filter(isCheckpoint).filter((checkpoint) => (
      new Date(checkpoint.updatedAt).getTime() >= oldestAllowed
    ));
  } catch {
    return [];
  }
};

export const loadPaymentCheckpoints = async (userId: string) => {
  await checkpointMutationQueue.catch(() => undefined);
  return (await readCheckpoints()).filter((checkpoint) => checkpoint.userId === userId);
};

export const savePaymentCheckpoint = async (
  checkpoint: Omit<PaymentCheckpoint, "updatedAt">,
) => {
  checkpointMutationQueue = checkpointMutationQueue
    .catch(() => undefined)
    .then(async () => {
      const checkpoints = await readCheckpoints();
      const nextCheckpoint: PaymentCheckpoint = {
        ...checkpoint,
        updatedAt: new Date().toISOString(),
      };
      const next = checkpoints.filter((item) => item.orderId !== checkpoint.orderId);
      next.push(nextCheckpoint);
      await AsyncStorage.setItem(PAYMENT_CHECKPOINTS_KEY, JSON.stringify(next));
    });
  await checkpointMutationQueue;
};

export const clearPaymentCheckpoint = async (orderId: string) => {
  checkpointMutationQueue = checkpointMutationQueue
    .catch(() => undefined)
    .then(async () => {
      const checkpoints = await readCheckpoints();
      await AsyncStorage.setItem(
        PAYMENT_CHECKPOINTS_KEY,
        JSON.stringify(checkpoints.filter((checkpoint) => checkpoint.orderId !== orderId)),
      );
    });
  await checkpointMutationQueue;
};

export const isTerminalPaymentStatus = (status: OnlinePaymentStatus) => (
  ["paid", "failed", "expired", "refunded"].includes(status)
);
