// Beat 10 NEW — PAYOFF · ClaimIt promoted to the hero, animated title hierarchy.
// 600f / 10s. Forked from peer Scene10Close (src/new-video untouched). Same text
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
//  C  CLAIMIT (HERO) .... 190-250 shield + "ClaimIt" wordmark fade/spring into the
//        vertical center — BIG. The hero moment.
//  D  BOTTOM CASCADE .... 300-460 team names cascade (stagger), links, then footer.
//  E  FINAL HOLD ........ 460-600 settled; ends on the still poster (no fade-out).
// ──────────────────────────────────────────────────────────────────────────────
import { ShieldCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { DP3_TAGLINE, DP16_CLOSE } from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

const REPO = "github.com/claimit-team/claimit";

// Final vertical slots (ClaimIt centered ~465 → slightly above screen center 540).
const LINE1_TOP = 250;
const LINE2_TOP = 332;
const HERO_TOP = 410; // flex row; visual center ≈ 465
const TEAM_TOP = 578;
const LINKS_TOP = 624;
const FOOTER_TOP = 664;
const TITLE_RISE = 180; // extra offset that drops the titles to center during A

export const Beat10New: React.FC = () => {
  return (
    <LightScene>
      <Inner />
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
  const brandOp = iv(frame, [190, 250], [0, 1]);
  const brandY = iv(frame, [190, 250], [18, 0]);

  // D: bottom cascade.
  const linksOp = iv(frame, [380, 430], [0, 1]);
  const footerOp = iv(frame, [410, 460], [0, 1]);

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
          const at = 300 + i * 18;
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
