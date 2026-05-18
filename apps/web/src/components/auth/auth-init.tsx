"use client";

import { signOut as firebaseSignOut, onAuthStateChanged } from "firebase/auth";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import { AuthApiError, getMe } from "@/lib/api/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store";

export function AuthInit({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  // Bumped on every onAuthStateChanged invocation so a getMe() in flight from
  // a previous auth state can detect it has been superseded and skip its
  // setUser/toast/signOut side effects. Without this guard, the older fetch
  // could resolve after the newer auth change and overwrite Zustand with
  // stale user data (e.g. account-A user persists after switching to B).
  const fetchVersionRef = useRef(0);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      const version = ++fetchVersionRef.current;

      if (!firebaseUser) {
        setUser(null);
        return;
      }

      setLoading(true);
      try {
        const user = await getMe();
        if (version !== fetchVersionRef.current) return;
        setUser(user);
      } catch (err) {
        if (version !== fetchVersionRef.current) return;
        console.error("Failed to load user profile from /auth/me:", err);
        const description =
          err instanceof AuthApiError
            ? err.message
            : "Couldn't load your profile. Please try signing in again.";
        toast.error("Sign-in failed", { description });
        try {
          await firebaseSignOut(auth);
        } catch {
          // Best-effort — onAuthStateChanged will fire null next, and we
          // already clear the store below.
        }
        setUser(null);
      }
    });
  }, [setUser, setLoading]);

  return <>{children}</>;
}
