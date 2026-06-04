// Beat 10 — PAYOFF · closing ClaimIt lockup · ~9.3s / 560f.
// Peer Scene09Close base (forked) → transition to a static ClaimIt logo lockup.
// NO subtitle, NO audio, NO fade-out — the composition ENDS on the still poster.
// (Old b35 payoff kept for now; user will compare and decide.)
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  PEER REVEAL ...... 6-150   "Your Money, Still Yours." (DISPLAY, letter-space
//        tighten) + "We just make sure you get it." reveal exactly as peer.
//  (hold) ............. 150-210  both lines fully visible.
//  B  MOVE UP + SHRINK . 210-282 the two-line group rises to top-center + scales
//        to ~65% (easeInOut) and STAYS (becomes a subtle header).
//  C  CLAIMIT LOCKUP ... 300+    in the freed center: ShieldCheck + "ClaimIt"
//        wordmark (brand blue) land together (useReveal spring); a small muted
//        tagline reveals ~12f after.
//  D  FINAL HOLD ....... 330-560 static poster — NO fade, NO drift. Ends on still.
// ──────────────────────────────────────────────────────────────────────────────
import { ShieldCheck } from "lucide-react";

import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { useReveal } from "../../polish/RevealCard";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";
import { Scene09CloseFast } from "./Scene09CloseFast";

const BRAND_BLUE = colors.brand.primary; // #27466E — same blue as b05 "How it works?" / "Built on…"
const LOCKUP_FROM = 300;

const ClaimItLockup: React.FC = () => {
  const r = useReveal(LOCKUP_FROM);
  const rt = useReveal(LOCKUP_FROM + 12);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 452,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          opacity: r.opacity,
          transform: `translateY(${r.translateY.toFixed(1)}px) scale(${r.scale.toFixed(4)})`,
          transformOrigin: "center",
        }}
      >
        <ShieldCheck size={54} color={BRAND_BLUE} strokeWidth={2.2} aria-hidden />
        <span
          style={{
            fontFamily: FONT_STACK_TEXT,
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1,
            color: BRAND_BLUE,
          }}
        >
          ClaimIt
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 568,
          textAlign: "center",
          opacity: rt.opacity,
          transform: `translateY(${rt.translateY.toFixed(1)}px)`,
          fontFamily: FONT_STACK_TEXT,
          fontSize: 22,
          color: colors.text.muted,
        }}
      >
        Your refund claim, taken care of.
      </div>
    </>
  );
};

export const Beat10: React.FC = () => (
  <HookAtmosphere>
    <Scene09CloseFast />
    <ClaimItLockup />
  </HookAtmosphere>
);
