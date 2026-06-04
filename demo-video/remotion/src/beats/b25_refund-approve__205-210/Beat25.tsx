// Beat 25 — Refund · approve & send · 2:05-2:10 · 300f
// "ClaimIt sends the claim. You stay focused." — ui-claimshell-loaded + Cursor clicks "Approve and send".
// NOTE: the Approve button renders exactly as the uiref shows it (the real near-black `bg-primary`).
// Per DEMO_INTERACTION_SPEC_v1 hard rules: do NOT pre-emptively make it green — the green dramatization
// is a separate decision the user makes after seeing this render.
import { Audio, Sequence, staticFile } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { UiClaimshellLoaded } from "../../uirefs";

export const Beat25: React.FC = () => (
  <HookAtmosphere>
    <UiClaimshellLoaded />
    <Cursor
      keyframes={[
        { frame: 0, x: 1500, y: 220 },
        { frame: 46, x: 1812, y: 110 }, // "Approve and send" (near-black bg-primary)
      ]}
      clicks={[{ frame: 56 }]}
    />
    <Sequence name="vo_b25" from={6}>
      <Audio src={staticFile("audio/vo/vo_b25.mp3")} />
    </Sequence>
    <BeatSubtitle text="ClaimIt sends the claim. You stay focused." fromFrame={6} durationFrames={176} />
  </HookAtmosphere>
);
