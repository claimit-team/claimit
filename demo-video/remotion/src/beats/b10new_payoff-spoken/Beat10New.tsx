// Beat 10 NEW — PAYOFF · ClaimIt promoted to the hero, animated title hierarchy.
// 540f / 9s. Forked from peer Scene10Close (src/new-video untouched). Same text
// content (DP3_TAGLINE, "We just make sure you get it.", DP16_CLOSE team/url),
// re-staged so ClaimIt is the LARGEST element in the vertical center.
//
// Size hierarchy (descending): ClaimIt 110 > "Your Money…" 60 > "We just…" 38 >
// team 22 > links 18 > footer 14. ClaimIt ≥ "Money" (TYPE.DISPLAY 88) in peer's
// original headline. Whole composition sits slightly above screen center.
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  TITLES IN CENTER .. 0-90    Line 1 + Line 2 fade in at FINAL smaller size,
//        at the vertical center; brief hold.
//  B  TITLES RISE ....... 90-180  the two-line group translates UP to its final
//        slot (above ClaimIt's future spot); center empties.
//  C  CLAIMIT (HERO) .... 240-300 shield + "ClaimIt" wordmark fade/spring into the
//        vertical center — BIG. The hero moment. [VO "ClaimIt" lands here.]
//  D  BOTTOM CASCADE .... 315-480 team names cascade (stagger), links, then footer.
//  E  FINAL HOLD ........ 480-540 settled; ends on the still poster (no fade-out).
// ──────────────────────────────────────────────────────────────────────────────
import { ShieldCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { DP3_TAGLINE, DP16_CLOSE } from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

const REPO = "github.com/claimit-team/claimit";

// Apple-keynote-close spacing: 3 distinct groups (titles / hero / credits) with
// GENEROUS gaps between groups (~110px clear) and tight spacing within each.
// Final vertical slots (ClaimIt centered ~460 → slightly above screen center 540).
const LINE1_TOP = 175; // Group A — title pair (tight internal: +82 to line 2)
const LINE2_TOP = 257;
const HERO_TOP = 405; // Group B — hero; flex row, visual center ≈ 460
const TEAM_TOP = 625; // Group C — credits stack (tight internal: +46, +40)
const LINKS_TOP = 671;
const FOOTER_TOP = 711;
const TITLE_RISE = 255; // extra offset that drops the titles to center during A

export const Beat10New: React.FC = () => {
  return (
    <LightScene>
      <Inner />
      {/* Opening line (Phase A). The ClaimIt hero moment stays subtitle-free. */}
      <BeatSubtitle text="Your money should still be yours." fromFrame={0} durationFrames={180} />
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  // A: titles fade in at center. B: rise to final slot.
  const line1Op = iv(frame, [6, 54], [0, 1]);
  const line2Op = iv(frame, [24, 72], [0, 1]);
  const titleRise = iv(frame, [90, 180], [TITLE_RISE, 0]);

  // C: ClaimIt hero springs into the (now empty) vertical center.
  // [VO CUE] Deep-voice "ClaimIt" lands here — around f240-300
  //          (0:04-0:05), as the big ClaimIt logo enters center.
  //          Intentionally NO subtitle here (the wordmark IS the message).
  const brandOp = iv(frame, [240, 300], [0, 1]);
  const brandY = iv(frame, [240, 300], [18, 0]);

  // D: bottom cascade.
  const linksOp = iv(frame, [400, 450], [0, 1]);
  const footerOp = iv(frame, [430, 480], [0, 1]);

  return (
    <AbsoluteFill>
      {/* Line 1 — "Your Money, Still Yours." (medium-large) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: LINE1_TOP,
          textAlign: "center",
          ...TYPE.DISPLAY,
          fontSize: 60,
          letterSpacing: "-1.8px",
          color: COLOR.INK,
          opacity: line1Op,
          transform: `translateY(${titleRise.toFixed(1)}px)`,
        }}
      >
        {DP3_TAGLINE}
      </div>

      {/* Line 2 — "We just make sure you get it." (medium) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: LINE2_TOP,
          textAlign: "center",
          ...TYPE.SUB,
          fontSize: 38,
          color: COLOR.MUTE,
          opacity: line2Op,
          transform: `translateY(${titleRise.toFixed(1)}px)`,
        }}
      >
        We just make sure you get it.
      </div>

      {/* Hero — shield + ClaimIt wordmark (LARGEST), vertical center */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: HERO_TOP,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          opacity: brandOp,
          transform: `translateY(${brandY.toFixed(1)}px)`,
        }}
      >
        <ShieldCheck size={76} color={COLOR.NAVY} strokeWidth={2.2} />
        <span
          style={{
            ...TYPE.DISPLAY,
            fontSize: 110,
            letterSpacing: "-2.5px",
            color: COLOR.NAVY,
          }}
        >
          {DP16_CLOSE.brand}
        </span>
      </div>

      {/* Team — cascade by name */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: TEAM_TOP,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          ...TYPE.MICRO,
          fontSize: 22,
          color: COLOR.BODY,
        }}
      >
        {DP16_CLOSE.team.map((name, i) => {
          const at = 315 + i * 18;
          const nameOp = iv(frame, [at, at + 40], [0, 1]);
          return (
            <span key={name} style={{ opacity: nameOp, display: "inline-flex" }}>
              {i > 0 && <span style={{ margin: "0 12px", opacity: 0.5 }}>·</span>}
              {name}
            </span>
          );
        })}
      </div>

      {/* Links */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: LINKS_TOP,
          textAlign: "center",
          ...TYPE.MICRO,
          fontSize: 18,
          color: COLOR.MUTE,
          opacity: linksOp,
        }}
      >
        {DP16_CLOSE.url}
        <span style={{ margin: "0 14px", opacity: 0.5 }}>·</span>
        {REPO}
      </div>

      {/* Hackathon credit (smallest) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: FOOTER_TOP,
          textAlign: "center",
          ...TYPE.FOOTNOTE,
          opacity: footerOp * 0.6,
        }}
      >
        Google Cloud Rapid Agent Hackathon · June 2026
      </div>
    </AbsoluteFill>
  );
};
