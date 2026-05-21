/**
 * UI store — global UI state.
 * Populated by feature tickets as needed.
 */

import { create } from "zustand";
import type { ProactiveOutput } from "@/types/assistant";

type ProactiveEntry = {
  /** The original NotificationEvent id — used to ack on dismiss. */
  notificationId: string;
  /** Rendered proactive output (opening message, key facts, quick actions). */
  output: ProactiveOutput;
  /** Original event_type — useful for telemetry / debug. */
  eventType: string;
  /**
   * The original NotificationEvent's raw `data` payload (ticket 5.14
   * B9). Preserved end-to-end so quick-action handlers can route to a
   * specific entity — most importantly `purchase_id` from a
   * `low_confidence_extract` event, which the FAB uses to push to
   * `/confirm/:purchase_id` instead of the generic /purchases list.
   * Typed as `unknown` because the wire payload is producer-defined;
   * consumers should narrow defensively before reading any field.
   */
  data: unknown;
};

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
   * Currently queued proactive event for the Floating Assistant.
   * - `null` when no event is pending.
   * - `ProactiveEntry` when a notification fires that maps to a known
   *   proactive template (see lib/proactive-templates.ts).
   *
   * Drives the FAB pulse ring AND the panel-content swap to render
   * ProactiveCard ahead of any chat thread.
   */
  proactiveEvent: ProactiveEntry | null;
  setProactiveEvent: (event: ProactiveEntry) => void;
  clearProactiveEvent: () => void;

  /**
   * Receipt-upload dialog open flag. Lives on the UI store (instead
   * of a per-component `useState`) so any control on any
   * authenticated page — sidebar entry, dashboard CTA, /purchases
   * empty-state, gmail-settings shortcut, proactive `navigate_upload`
   * action — can open the SAME dialog. The dialog itself is mounted
   * once at the authenticated layout level (see
   * `apps/web/src/app/(authenticated)/layout.tsx`).
   */
  uploadDialogOpen: boolean;
  setUploadDialogOpen: (open: boolean) => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  assistantPaneOpen: false,
  toggleAssistantPane: () =>
    set((state) => ({
      assistantPaneOpen: !state.assistantPaneOpen,
      // Proactive events are NOT auto-cleared on open/close — they require
      // an explicit dismiss (ProactiveCard's X button) which also fires the
      // server ack. Auto-clearing on every open meant a user who briefly
      // peeked at the panel and closed it lost the proactive context
      // without ever interacting with the card.
      proactiveEvent: state.proactiveEvent,
    })),

  claimEmbeddedAssistantExpanded: false,
  setClaimEmbeddedAssistantExpanded: (claimEmbeddedAssistantExpanded) =>
    set({ claimEmbeddedAssistantExpanded }),
  toggleClaimEmbeddedAssistant: () =>
    set((state) => ({
      claimEmbeddedAssistantExpanded: !state.claimEmbeddedAssistantExpanded,
    })),

  proactiveEvent: null,
  setProactiveEvent: (event) => set({ proactiveEvent: event }),
  clearProactiveEvent: () => set({ proactiveEvent: null }),

  uploadDialogOpen: false,
  setUploadDialogOpen: (uploadDialogOpen) => set({ uploadDialogOpen }),
}));
