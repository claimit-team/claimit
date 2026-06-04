// Beat 06 — DEMO · upload → OCR-extract · ~16s / 960f.
// First portion of the DEMO section (will eventually consolidate b10-b14;
// b10-b14 stay alone until the user reviews this). Subtitle-only (no VO).
// Real UI: UiAppShellEmpty + UploadModal (uirefs). Cursor = polish/Cursor.
// All motion frame-driven (immune to the globals.css JITTER GUARD).
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  DEMO INTRO ............. 0-150   Empty dashboard sits BLURRED (filter 14→0).
//        Orange "DEMO" fades in big+centered (0-30), holds, flies up + fades
//        (74-102) as the blur clears (80-124) → reveals the real dashboard.
//        No subtitle.
//  B  UPLOAD ................. 150-470  Cursor enters bottom-right → "Browse files"
//        CTA (262), click (278) → UploadModal springs in (overshoot). Cursor →
//        modal dropzone (410), click (424) → receipt POPS at the click point
//        (spring overshoot 0→~1.08→1, 430). Cursor slides off.
//        sub "Drop your receipt — any photo or PDF."  f200-430
//  C  EXTRACT ................ 430-960  Modal+dashboard fade out (470-500); the
//        receipt glides + scales to the LEFT half (470-566). Clean two-column
//        focus view fades in (508-560): receipt | OCR confirm panel. A glow bar
//        SCANS the receipt top→bottom (590-648); an arrow reveals in the gap
//        (656); OCR fields TYPE in char-by-char (Platform→Product→Price→Date,
//        from 682). End state holds.
//        sub "Gemini reads the merchant, item, date, and price."  f590-852
// ──────────────────────────────────────────────────────────────────────────────
import { ArrowRight } from "lucide-react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { useReveal } from "../../polish/RevealCard";
import { UiAppShellEmpty } from "../../uirefs";
import { UploadModal } from "../../uirefs/_pages";
import { OcrConfirmPanel } from "./OcrConfirmPanel";
import { RECEIPT_H, RECEIPT_W, ReceiptCard } from "./ReceiptCard";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const ORANGE = "#FFA500";

// ── Timeline anchors ──
const BLUR_IN = [80, 124] as const;
const DEMO_FADE_OUT = [78, 102] as const;
const MODAL_START = 280;
const POP_START = 430;
const MOVE = [470, 566] as const;
const DASH_OUT = [470, 500] as const;
const PC_IN = [508, 560] as const;
const SCAN = [590, 648] as const;
const ARROW_START = 656;
const FIELDS_T0 = 682;

// Phase-C receipt placement (left column) + OCR panel (right column).
const RX_FROM = 960;
const RX_TO = 560;
const RY_FROM = 575;
const RY_TO = 548;

const DemoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > 110) return null;
  const opacity =
    interpolate(frame, [0, 30], [0, 1], C) * interpolate(frame, DEMO_FADE_OUT, [1, 0], C);
  const enterScale = interpolate(frame, [0, 34], [0.88, 1], { ...C, easing: easings.sharpOut });
  const ty = interpolate(frame, [74, 102], [0, -560], { ...C, easing: easings.easeIn });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: 210,
          fontWeight: 800,
          letterSpacing: -6,
          color: ORANGE,
          opacity,
          transform: `translateY(${ty.toFixed(1)}px) scale(${enterScale.toFixed(4)})`,
        }}
      >
        DEMO
      </div>
    </AbsoluteFill>
  );
};

const ScanOverlay: React.FC<{ progress: number; opacity: number }> = ({ progress, opacity }) => {
  const y = progress * RECEIPT_H;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: -6,
          right: -6,
          top: y - 26,
          height: 52,
          background:
            "linear-gradient(180deg, rgba(255,165,0,0) 0%, rgba(255,165,0,0.10) 35%, rgba(255,180,40,0.28) 50%, rgba(255,165,0,0.10) 65%, rgba(255,165,0,0) 100%)",
          opacity,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -2,
          right: -2,
          top: y,
          height: 2,
          background: "rgba(255,176,32,0.95)",
          boxShadow: "0 0 14px 3px rgba(255,176,32,0.6)",
          opacity,
          pointerEvents: "none",
        }}
      />
    </>
  );
};

export const Beat06: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ease = easings.easeInOut;

  // Phase A — blur + DEMO handled in DemoIntro / dashboard wrapper.
  const blur = interpolate(frame, BLUR_IN, [14, 0], { ...C, easing: ease });
  const dashOut = interpolate(frame, DASH_OUT, [1, 0], C);

  // Modal open (spring overshoot).
  const modalSpring = spring({
    frame: frame - MODAL_START,
    fps,
    config: { damping: 12, mass: 0.7, stiffness: 110 },
    durationInFrames: 36,
  });
  const modalScale = 0.94 + 0.06 * modalSpring;
  const modalOp = interpolate(frame, [MODAL_START + 2, MODAL_START + 30], [0, 1], C) * dashOut;

  // Receipt — pop (spring overshoot) → glide + grow to the left column.
  const popSpring = spring({
    frame: frame - POP_START,
    fps,
    config: { damping: 10, mass: 0.5, stiffness: 130 },
    durationInFrames: 32,
  });
  const growScale = interpolate(frame, MOVE, [1, 1.12], { ...C, easing: ease });
  const receiptScale = popSpring * growScale;
  const receiptX = interpolate(frame, MOVE, [RX_FROM, RX_TO], { ...C, easing: ease });
  const receiptY = interpolate(frame, MOVE, [RY_FROM, RY_TO], { ...C, easing: ease });
  const receiptOp = interpolate(frame, [POP_START, POP_START + 18], [0, 1], C);

  // Phase C reveal.
  const pcP = interpolate(frame, PC_IN, [0, 1], { ...C, easing: ease });
  const scanP = interpolate(frame, SCAN, [0, 1], { ...C, easing: ease });
  const scanOpacity =
    interpolate(frame, [SCAN[0], SCAN[0] + 14], [0, 1], C) *
    interpolate(frame, [SCAN[1] - 14, SCAN[1]], [1, 0], C);
  const arrowR = useReveal(ARROW_START);

  return (
    <HookAtmosphere>
      {/* Dashboard layer — blurred in A, clear in B, fades out into C. */}
      <AbsoluteFill style={{ filter: `blur(${blur.toFixed(2)}px)`, opacity: dashOut }}>
        <UiAppShellEmpty />
      </AbsoluteFill>

      {/* Upload modal (B) — spring-overshoot open over the dashboard. */}
      {frame >= MODAL_START && frame < DASH_OUT[1] + 4 ? (
        <AbsoluteFill
          style={{
            opacity: modalOp,
            transform: `scale(${modalScale.toFixed(4)})`,
            transformOrigin: "center center",
          }}
        >
          <UploadModal />
        </AbsoluteFill>
      ) : null}

      {/* Phase C — clean two-column focus view (title + OCR panel + arrow). */}
      {frame >= PC_IN[0] ? (
        <AbsoluteFill style={{ opacity: pcP }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 92,
              textAlign: "center",
              transform: `translateY(${((1 - pcP) * 12).toFixed(1)}px)`,
            }}
          >
            <h1 className="text-2xl font-semibold text-neutral-900">Review purchase details</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Confirm the extracted information before ClaimIt starts monitoring.
            </p>
          </div>

          <div
            style={{
              position: "absolute",
              left: 912,
              top: 250,
              width: 608,
              transform: `translateY(${((1 - pcP) * 14).toFixed(1)}px)`,
            }}
          >
            <OcrConfirmPanel t0={FIELDS_T0} />
          </div>

          <div
            style={{
              position: "absolute",
              left: 814,
              top: 526,
              opacity: arrowR.opacity,
              transform: `translateY(${arrowR.translateY.toFixed(1)}px) scale(${arrowR.scale.toFixed(3)})`,
            }}
          >
            <ArrowRight size={46} color="#27466E" strokeWidth={2.4} aria-hidden />
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Receipt — persistent from the pop; glides into the left column + scans. */}
      {frame >= POP_START ? (
        <div
          style={{
            position: "absolute",
            left: receiptX,
            top: receiptY,
            opacity: receiptOp,
            transform: `translate(-50%, -50%) scale(${receiptScale.toFixed(4)})`,
          }}
        >
          <div style={{ position: "relative", width: RECEIPT_W, height: RECEIPT_H }}>
            <ReceiptCard />
            {frame >= SCAN[0] && frame <= SCAN[1] + 2 ? (
              <ScanOverlay progress={scanP} opacity={scanOpacity} />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Cursor (B) — enters from off-screen, clicks the CTA, then the modal
          dropzone (HOLDS through the click + receipt pop), then slides off. */}
      {frame >= 150 && frame < 498 ? (
        <Cursor
          keyframes={[
            { frame: 158, x: 1980, y: 1140 }, // off-screen bottom-right
            { frame: 255, x: 1088, y: 492 }, // → "Browse files" CTA
            { frame: 320, x: 1088, y: 492 }, // hold while the modal opens
            { frame: 405, x: 960, y: 575 }, // → modal dropzone
            { frame: 450, x: 960, y: 575 }, // HOLD through click (424) + pop (430)
            { frame: 492, x: 1010, y: 1150 }, // slide off-screen
          ]}
          clicks={[{ frame: 278 }, { frame: 424 }]}
        />
      ) : null}

      <DemoIntro />

      <BeatSubtitle
        text="Drop your receipt — any photo or PDF."
        fromFrame={200}
        durationFrames={210}
      />
      <BeatSubtitle
        text="Gemini reads the merchant, item, date, and price."
        fromFrame={590}
        durationFrames={262}
      />
    </HookAtmosphere>
  );
};
