/**
 * Auth store — current MongoDB User state.
 * Synced from GET /api/v1/auth/me on Firebase sign-in by AuthInit.
 */
import type { User as SharedUser } from "@claimit/mongodb-types";
import { create } from "zustand";
import type { AuthApiError } from "@/lib/api/auth";

type User = SharedUser | null;

type AuthState = {
  user: User;
  isLoading: boolean;
  signInError: AuthApiError | null;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  setSignInError: (error: AuthApiError | null) => void;
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  signInError: null,
  setUser: (user) =>
    set({
      user,
      isLoading: false,
      ...(user ? { signInError: null } : {}),
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setSignInError: (signInError) => set({ signInError }),
  signOut: () => set({ user: null, isLoading: false }),
}));
