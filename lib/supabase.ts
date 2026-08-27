import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock, type Session } from "@supabase/supabase-js";
import * as ExpoLinking from "expo-linking";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

// Native auth emails must always return to the installed KopiPow app. Using a
// fixed custom-scheme URL also keeps Supabase's redirect allow-list stable
// across development, preview, and production builds.
export const authRedirectUrl = Platform.OS === "web"
  ? ExpoLinking.createURL("auth/callback")
  : "kopipow://auth/callback";

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
    auth: {
      ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
      lockAcquireTimeout: 10_000,
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
    accessToken: getFreshAccessToken,
  })
  : null;
