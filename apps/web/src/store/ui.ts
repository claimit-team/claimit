/**
 * UI store — global UI state.
 * Populated by feature tickets as needed.
 */
import { create } from "zustand";

type UIState = {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Assistant chat pane (used by 5.9, 5.10)
  assistantPaneOpen: boolean;
  toggleAssistantPane: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  assistantPaneOpen: false,
  toggleAssistantPane: () => set((state) => ({ assistantPaneOpen: !state.assistantPaneOpen })),
}));
