// React Context carrying the per-frame Act III state into the shim
// hooks. The shims (useAssistantStream, useConversations) are
// imported by apps/web components via the @/* alias, but they're our
// shim modules under remotion/src/shims/*. Those shims can call
// useDemoState() to observe the active Act III frame state and
// return frame-driven values — which lets the real ClaimDetailShell
// render typewriter / streaming reply / etc, without any apps/web
// modifications.

import { createContext, useContext } from "react";

import { type Act3FrameState, defaultAct3FrameState } from "../shots/_shared/types";

const DemoStateContext = createContext<Act3FrameState | null>(null);

export const DemoStateProvider = DemoStateContext.Provider;

/**
 * Read the current Act III frame state. Returns a default state when
 * no provider is mounted (e.g., when the shell is rendered outside
 * Act III's tree — shouldn't happen, but the safe fallback prevents
 * the shim hooks from crashing in static tests).
 */
export function useDemoState(): Act3FrameState {
  const value = useContext(DemoStateContext);
  return value ?? defaultAct3FrameState();
}
