import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  AppState,
  Linking,
  Platform,
  type AppStateStatus,
} from "react-native";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  PLACEHOLDER_SESSION,
  type AppUser,
} from "../appState";
import {
  authRedirectUrl,
  isSupabaseConfigured,
  setSupabaseSession,
  supabaseAuth as supabase,
} from "../lib/supabase";
import {
  CUSTOMER_ACCESS,
  loadAppAccess,
  type AppAccess,
} from "../lib/access";

type AuthResult = {
  error: string | null;
  message?: string;
};

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

const getUnexpectedAuthError = (error: unknown) => (
  error instanceof Error && error.name === "AbortError"
    ? "The account service could not be reached. Check your connection and try again."
    : error instanceof Error && error.message
    ? error.message
    : "Something went wrong while contacting the account service. Please try again."
);

const getCallbackParams = (url: string) => {
  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");
  const queryEnd = hashStart >= 0 ? hashStart : url.length;
  const query = queryStart >= 0
    ? url.slice(queryStart + 1, queryEnd)
    : "";
  const fragment = hashStart >= 0
    ? url.slice(hashStart + 1)
    : "";
  const params = new URLSearchParams(query);

  new URLSearchParams(fragment).forEach((value, key) => {
    params.set(key, value);
  });

  return params;
};

const restoreSessionFromCallback = async (url: string) => {
  if (!supabase || !url.includes("auth/callback")) return false;

  const params = getCallbackParams(url);
  const callbackError = params.get("error_description")
    ?? params.get("error_code")
    ?? params.get("error");
  if (callbackError) throw new Error(callbackError);

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const authorizationCode = params.get("code");
  const isPasswordRecovery = params.get("type") === "recovery";

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  } else if (authorizationCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authorizationCode);
    if (error) throw error;
  }

  return isPasswordRecovery;
};

const runAuthRequest = async (
  request: () => Promise<AuthResult>,
  timeoutResult: AuthResult = {
    error: "The account service is taking too long to respond. Check your connection and inbox before trying again.",
  },
): Promise<AuthResult> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<AuthResult>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(timeoutResult);
      }, AUTH_REQUEST_TIMEOUT_MS);
    });

    return await Promise.race([request(), timeout]);
  } catch (error) {
    return { error: getUnexpectedAuthError(error) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

type AuthContextValue = {
  access: AppAccess;
  appUser: AppUser;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isPasswordRecovery: boolean;
  isAccessLoading: boolean;
  accessError: string | null;
  isSupabaseConfigured: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (displayName: string, email: string, password: string) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  deleteAccount: () => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  updateDisplayName: (displayName: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const getInitials = (displayName: string) => {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");

  return initials || "KF";
};

const getAppUser = (session: Session | null): AppUser => {
  if (!session) return PLACEHOLDER_SESSION.user;

  const email = session.user.email ?? null;
  const metadataName = session.user.user_metadata.display_name
    ?? session.user.user_metadata.full_name;
  const emailName = email?.split("@")[0].replace(/[._-]+/g, " ");
  const displayName = typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : emailName?.trim() || "Kopi Friend";

  return {
    id: session.user.id,
    displayName,
    initials: getInitials(displayName),
    email,
  };
};

const notConfiguredResult = (): AuthResult => ({
  error: "Add your public Supabase URL and publishable key to .env, then restart Expo.",
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [access, setAccess] = useState<AppAccess>(CUSTOMER_ACCESS);
  const [isAccessLoading, setIsAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsInitializing(false);
      return;
    }

    const client = supabase;
    let isMounted = true;

    void client.auth.getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (!error) {
          setSupabaseSession(data.session);
          setSession(data.session);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) setIsInitializing(false);
      });

    const { data: authListener } = client.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (!isMounted) return;
      setSupabaseSession(nextSession);
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      setIsInitializing(false);
    });

    const handleAppStateChange = (state: AppStateStatus) => {
      if (Platform.OS === "web") return;
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const appStateListener = AppState.addEventListener("change", handleAppStateChange);
    const authLinkListener = Linking.addEventListener("url", ({ url }) => {
      void restoreSessionFromCallback(url)
        .then((isRecovery) => {
          if (isMounted && isRecovery) setIsPasswordRecovery(true);
        })
        .catch(() => undefined);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) {
        return restoreSessionFromCallback(url).then((isRecovery) => {
          if (isMounted && isRecovery) setIsPasswordRecovery(true);
        });
      }
      return undefined;
    }).catch(() => undefined);

    if (Platform.OS !== "web" && AppState.currentState === "active") {
      client.auth.startAutoRefresh();
    }

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      appStateListener.remove();
      authLinkListener.remove();
      if (Platform.OS !== "web") client.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const userId = session?.user.id;

    if (!userId) {
      setAccess(CUSTOMER_ACCESS);
      setAccessError(null);
      setIsAccessLoading(false);
      return () => { active = false; };
    }

    setIsAccessLoading(true);
    setAccessError(null);
    void loadAppAccess(userId)
      .then((result) => {
        if (!active) return;
        setAccess(result.access);
        setAccessError(result.error);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAccess(CUSTOMER_ACCESS);
        setAccessError(getUnexpectedAuthError(error));
      })
      .finally(() => {
        if (active) setIsAccessLoading(false);
      });

    return () => { active = false; };
  }, [session?.user.id]);

  const value = useMemo<AuthContextValue>(() => ({
    access,
    accessError,
    appUser: getAppUser(session),
    isAuthenticated: Boolean(session),
    isInitializing,
    isPasswordRecovery,
    isAccessLoading,
    isSupabaseConfigured,
    session,
    signIn: (email, password) => runAuthRequest(async () => {
      if (!supabase) return notConfiguredResult();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return { error: error?.message ?? null };
    }),
    signUp: (displayName, email, password) => runAuthRequest(async () => {
      if (!supabase) return notConfiguredResult();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUrl,
          data: {
            display_name: displayName.trim(),
          },
        },
      });

      if (error) return { error: error.message };
      return {
        error: null,
        message: data.session
          ? "Your KopiPow account is ready."
          : "Check your inbox to confirm your email, then sign in.",
      };
    }),
    sendPasswordReset: (email) => runAuthRequest(
      async () => {
        if (!supabase) return notConfiguredResult();
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirectUrl,
        });
        return {
          error: error?.message ?? null,
          message: error ? undefined : "If that email is registered, a recovery message is on its way.",
        };
      },
      {
        error: null,
        message: "Your request is still being delivered. If that email is registered, check its inbox and spam folder shortly.",
      },
    ),
    updatePassword: (password) => runAuthRequest(async () => {
      if (!supabase) return notConfiguredResult();
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) setIsPasswordRecovery(false);
      return {
        error: error?.message ?? null,
        message: error ? undefined : "Your password has been updated.",
      };
    }),
    deleteAccount: () => runAuthRequest(async () => {
      if (!supabase) return notConfiguredResult();

      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: {},
      });
      if (error) {
        let message = error.message;
        if (error && typeof error === "object" && "context" in error) {
          const context = (error as { context?: unknown }).context;
          if (context instanceof Response) {
            try {
              const body = await context.clone().json() as { error?: string };
              if (body.error) message = body.error;
            } catch {
              // Use the SDK error when the Function response is not JSON.
            }
          }
        }
        return { error: message };
      }
      if (data?.error) return { error: String(data.error) };

      setSupabaseSession(null);
      setSession(null);
      await supabase.auth.signOut({ scope: "local" });
      return { error: null, message: "Your KopiPow account and data were deleted." };
    }),
    signOut: () => runAuthRequest(async () => {
      if (!supabase) return notConfiguredResult();
      const { error } = await supabase.auth.signOut();
      return { error: error?.message ?? null };
    }),
    updateDisplayName: (displayName) => runAuthRequest(async () => {
      if (!supabase) return notConfiguredResult();
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName.trim() },
      });
      return {
        error: error?.message ?? null,
        message: error ? undefined : "Profile updated.",
      };
    }),
  }), [access, accessError, isAccessLoading, isInitializing, isPasswordRecovery, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
