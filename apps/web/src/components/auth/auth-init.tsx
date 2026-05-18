"use client";

import { signOut as firebaseSignOut, onAuthStateChanged } from "firebase/auth";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { AuthApiError, getMe } from "@/lib/api/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store";

export function AuthInit({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        return;
      }

      setLoading(true);
      try {
        const user = await getMe();
        setUser(user);
      } catch (err) {
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
