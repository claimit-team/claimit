/**
 * Auth store — current user state.
 * Wired up properly in ticket 5.2 (Auth scaffold with Google Identity Platform).
 */
import { create } from "zustand";

type User = {
  id: string;
  email: string;
  name: string | null;
} | null;

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
  signOut: () => set({ user: null }),
}));
