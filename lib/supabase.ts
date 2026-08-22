import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";
import * as ExpoLinking from "expo-linking";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
// Edge Functions may need a little longer while they verify a payment with the
// provider. A short timeout caused valid foreground-return requests to be
// aborted when closing the Midtrans WebView.
const SUPABASE_FETCH_TIMEOUT_MS = 30_000;

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", abortFromCaller);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};

export const authRedirectUrl = ExpoLinking.createURL("auth/callback");

export const isSupabaseConfigured = Boolean(
  supabaseUrl
  && supabasePublishableKey
  && !supabaseUrl.includes("your-project-ref")
  && !supabasePublishableKey.includes("your_key_here"),
);

let activeAccessToken: string | null = null;
let activeAccessTokenExpiresAt = 0;
let tokenRefreshInFlight: Promise<string | null> | null = null;

// Authentication owns persistent storage and token refresh. Keeping it
// separate prevents every cart/order/Function request from waiting on the
// auth storage lock before it can reach Supabase.
export const supabaseAuth = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
    global: {
      fetch: fetchWithTimeout,
    },
    auth: {
      ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
  : null;

export const setSupabaseSession = (session: Session | null) => {
  activeAccessToken = session?.access_token ?? null;
  activeAccessTokenExpiresAt = session?.expires_at ?? 0;
};

const getFreshAccessToken = async () => {
  if (!activeAccessToken) return null;

  const refreshBefore = Math.floor(Date.now() / 1000) + 60;
  if (!activeAccessTokenExpiresAt || activeAccessTokenExpiresAt > refreshBefore) {
    return activeAccessToken;
  }
  if (!supabaseAuth) return null;
  if (tokenRefreshInFlight) return tokenRefreshInFlight;

  tokenRefreshInFlight = (async () => {
    const { data, error } = await supabaseAuth.auth.refreshSession();
    if (error || !data.session) {
      setSupabaseSession(null);
      void supabaseAuth.auth.signOut({ scope: "local" }).catch(() => undefined);
      return null;
    }

    setSupabaseSession(data.session);
    return data.session.access_token;
  })().finally(() => {
    tokenRefreshInFlight = null;
  });

  return tokenRefreshInFlight;
};

// App data calls use the access token already observed by AuthProvider. The
// callback is lock-free and is refreshed synchronously on every auth event.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
    global: {
      fetch: fetchWithTimeout,
    },
    accessToken: getFreshAccessToken,
  })
  : null;
