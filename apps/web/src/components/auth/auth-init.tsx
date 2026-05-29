"use client";

import { signOut as firebaseSignOut, onAuthStateChanged } from "firebase/auth";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import { AuthApiError, getMe } from "@/lib/api/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store";

function logAuthStateEvent(event: string, data?: Record<string, unknown>) {
  console.info("[auth.signin]", { event, ts: Date.now(), ...data });
}

export function AuthInit({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setSignInError = useAuthStore((s) => s.setSignInError);
  // Bumped on every onAuthStateChanged invocation so a getMe() in flight from
  // a previous auth state can detect it has been superseded and skip its
  // setUser/toast/signOut side effects. Without this guard, the older fetch
  // could resolve after the newer auth change and overwrite Zustand with
  // stale user data (e.g. account-A user persists after switching to B).
  //
  // Invariant: only the callback whose version === fetchVersionRef.current
  // may mutate user/signInError/toast/isLoading. Stale callbacks log and
  // return without touching state — the latest callback owns isLoading until
  // it completes (success via setUser, error via setUser(null)).
  const fetchVersionRef = useRef(0);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      const version = ++fetchVersionRef.current;

      logAuthStateEvent("authstate.fired", { hasUser: Boolean(firebaseUser), version });

      if (!firebaseUser) {
        setUser(null);
        logAuthStateEvent("authstate.success", { version, reason: "signed-out" });
        return;
      }

      setLoading(true);
      try {
        const user = await getMe();
        if (version !== fetchVersionRef.current) {
          logAuthStateEvent("authstate.stale-skip", {
            version,
            current: fetchVersionRef.current,
            path: "success",
          });
          return;
        }
        setUser(user);
        logAuthStateEvent("authstate.success", { version });
      } catch (err) {
        if (version !== fetchVersionRef.current) {
          logAuthStateEvent("authstate.stale-skip", {
            version,
            current: fetchVersionRef.current,
            path: "error",
          });
          return;
        }

        console.error("Failed to load user profile from /auth/me:", err);

        const authError =
          err instanceof AuthApiError
            ? err
            : new AuthApiError(
                "unknown",
                "Couldn't load your profile. Please try signing in again.",
              );

        setSignInError(authError);
        logAuthStateEvent("authstate.error", {
          version,
          code: authError.code,
          message: authError.message,
        });

        if (typeof window !== "undefined" && window.location.pathname === "/login") {
          // LoginView displays this via PostOAuthOverlay; skip toast to avoid duplicate UI.
        } else {
          toast.error("Sign-in failed", { description: authError.message });
        }

        try {
          await firebaseSignOut(auth);
        } catch {
          // Best-effort — onAuthStateChanged will fire null next, and we
          // already clear the store below.
        }
        setUser(null);
      }
    });
  }, [setUser, setLoading, setSignInError]);

  return <>{children}</>;
}
