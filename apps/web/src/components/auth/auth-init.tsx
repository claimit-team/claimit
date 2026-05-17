"use client";

import { onAuthStateChanged } from "firebase/auth";
import { type ReactNode, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/store";

export function AuthInit({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        return;
      }

      // TODO(6.2): call GET /api/v1/auth/me here to fetch full User from MongoDB
      // (creates record on first login). For now, Zustand stores Firebase user only.
      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        name: firebaseUser.displayName,
      });
    });
  }, [setUser]);

  return children;
}
