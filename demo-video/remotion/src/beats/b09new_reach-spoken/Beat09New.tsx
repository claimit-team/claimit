// Beat 09 — DEMO · reach (26 retailers) + policy handling (4 types) · ~15s / 880f.
// Two acts in one flow: the 26-logo reach wall (peer Scene08Reach 0-9s, forked),
// then the 4 platform-policy types (peer Scene07Platforms/FourCardGridLayer,
// forked) "pour in from the bottom" and push the logo wall up & out. Forks live
// in this folder; src/new-video is untouched. Subtitle-only. JITTER-GUARD safe.
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  REACH ............ 0-340   entry scale 0.88→1.0; 26 logos stagger in (peer
//        pattern); bottom held empty.  sub "26+ retailers, and counting." f70-310
//  B  POLICY TITLE ..... 340-430 a blue "Every store, its own policy." fades into
//        the empty bottom space (it is the rising grid's header).
//  C  ROW 1 ............ 430-540 top 2 policy cards (Email · Chat) reveal in the
//        bottom (typewriter-free useReveal-style pop + blur-sharpen); logos stay.
//        sub "Every store has its own rules — we handle them all." f380-640
//  D  ROW 2 + PUSH ..... 540-620 bottom 2 cards (In-Store · Self-Service) reveal;
//        SIMULTANEOUSLY the logo wall slides UP + fades, and the grid (title +
//        4 cards) rises to fill the screen.
//  E  4-UI SLOW SCROLL . 620-820 all 4 cards centered, gentle continuous drift up.
//  F  EXIT ............. 820-880 fade to 0. Creep zoom 1.0→1.035 throughout.
// ──────────────────────────────────────────────────────────────────────────────
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { Scene07PlatformFast } from "./Scene07PlatformFast";
import { Scene08ReachLogosFast } from "./Scene08ReachLogosFast";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const BRAND_BLUE = "#27466E";
const GRID_TOP = 150;
const GRID_DOWN = 470; // how far the grid block sits below its final spot during A-C
const ROW1_FROM = 430;
const ROW2_FROM = 545;

export const Beat09New: React.FC = () => {
  const frame = useCurrentFrame();
  const ease = easings.easeInOut;

  const scale = interpolate(frame, [0, 40, 860], [0.88, 1.0, 1.035], {
    ...C,
    easing: easings.easeOut,
  });
  const opacity =
    interpolate(frame, [0, 30], [0, 1], C) *
    interpolate(frame, [820, 875], [1, 0], { ...C, easing: easings.easeIn });

  // Logo wall — holds, then slides up + fades as the grid rises (phase D).
  const logoTy = interpolate(frame, [540, 610], [0, -360], { ...C, easing: ease });
  const logoOp = interpolate(frame, [540, 600], [1, 0], { ...C, easing: ease });

  // Grid block (policy title + 4 cards) — sits +470 below during A-C, rises to 0
  // in D (push-up), then drifts gently up in E-F (the "feed keeps flowing" feel).
  const gridTy =
    interpolate(frame, [540, 620], [GRID_DOWN, 0], { ...C, easing: ease }) +
    interpolate(frame, [680, 860], [0, -70], C);
  const titleOp = interpolate(frame, [340, 400], [0, 1], C);

  return (
    <HookAtmosphere>
      <AbsoluteFill
        style={{
          opacity,
          transform: `scale(${scale.toFixed(4)})`,
          transformOrigin: "center center",
        }}
      >
        {/* Reach logo wall */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: logoOp,
            transform: `translateY(${logoTy.toFixed(1)}px)`,
          }}
        >
          <Scene08ReachLogosFast />
        </div>

        {/* Policy block — title + 4-card grid; rises from the bottom */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${gridTy.toFixed(1)}px)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: GRID_TOP - 58,
              textAlign: "center",
              opacity: titleOp,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: BRAND_BLUE,
            }}
          >
            Every store, its own policy.
          </div>
          <Scene07PlatformFast gridTop={GRID_TOP} row1From={ROW1_FROM} row2From={ROW2_FROM} />
        </div>
      </AbsoluteFill>

      {/* Production VO-aligned subtitles (replace the 2 legacy burned subs). */}
      <BeatSubtitle
        text="We're live with Best Buy and Target."
        fromFrame={72}
        durationFrames={138}
      />
      <BeatSubtitle text="With policies mapped for 26 more." fromFrame={210} durationFrames={168} />
      <BeatSubtitle text="Every retailer has its own path." fromFrame={432} durationFrames={216} />
      <BeatSubtitle
        text="Email, chat, phone, or in store — ClaimIt helps you take the next step."
        fromFrame={648}
        durationFrames={174}
      />
    </HookAtmosphere>
  );
};
