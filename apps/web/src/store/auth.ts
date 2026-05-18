/**
 * Auth store — current MongoDB User state.
 * Synced from GET /api/v1/auth/me on Firebase sign-in by AuthInit.
 */
import type { User as SharedUser } from "@claimit/mongodb-types";
import { create } from "zustand";

type User = SharedUser | null;

type AuthState = {
  user: User;
  isLoading: boolean;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: () => set({ user: null, isLoading: false }),
}));
