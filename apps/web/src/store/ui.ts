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

  /** On /claims/[id]: maximizes embedded assistant pane in the layout (batch 6) */
  claimEmbeddedAssistantExpanded: boolean;
  setClaimEmbeddedAssistantExpanded: (expanded: boolean) => void;
  toggleClaimEmbeddedAssistant: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  assistantPaneOpen: false,
  toggleAssistantPane: () => set((state) => ({ assistantPaneOpen: !state.assistantPaneOpen })),

  claimEmbeddedAssistantExpanded: false,
  setClaimEmbeddedAssistantExpanded: (claimEmbeddedAssistantExpanded) =>
    set({ claimEmbeddedAssistantExpanded }),
  toggleClaimEmbeddedAssistant: () =>
    set((state) => ({
      claimEmbeddedAssistantExpanded: !state.claimEmbeddedAssistantExpanded,
    })),
}));
