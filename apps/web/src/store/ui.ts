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

  /**
   * Floating Assistant pulse signal — true when a proactive event is queued
   * (e.g. price drop detected, claim needs review). Drives the accent ring on
   * the FAB. Cleared automatically when the assistant pane is opened.
   */
  hasProactiveEvent: boolean;
  setHasProactiveEvent: (next: boolean) => void;
  triggerProactiveEvent: () => void;
  dismissProactiveEvent: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  assistantPaneOpen: false,
  toggleAssistantPane: () =>
    set((state) => ({
      assistantPaneOpen: !state.assistantPaneOpen,
      // Opening the pane acknowledges any queued proactive event.
      hasProactiveEvent: !state.assistantPaneOpen ? false : state.hasProactiveEvent,
    })),

  claimEmbeddedAssistantExpanded: false,
  setClaimEmbeddedAssistantExpanded: (claimEmbeddedAssistantExpanded) =>
    set({ claimEmbeddedAssistantExpanded }),
  toggleClaimEmbeddedAssistant: () =>
    set((state) => ({
      claimEmbeddedAssistantExpanded: !state.claimEmbeddedAssistantExpanded,
    })),

  hasProactiveEvent: false,
  setHasProactiveEvent: (hasProactiveEvent) => set({ hasProactiveEvent }),
  triggerProactiveEvent: () => set({ hasProactiveEvent: true }),
  dismissProactiveEvent: () => set({ hasProactiveEvent: false }),
}));
