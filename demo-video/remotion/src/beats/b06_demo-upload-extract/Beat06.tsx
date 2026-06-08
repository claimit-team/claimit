// Beat 06 — DEMO · upload → OCR-extract · ~16s / 960f.
// First portion of the DEMO section. Subtitle-only (no VO). Real UI:
// UiAppShellEmpty (establishing) + UploadModal (the single upload surface).
// Cursor = polish/Cursor. Names the Ingest Agent (Gemini) doing the extraction.
// All motion frame-driven (immune to the globals.css JITTER GUARD).
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  ESTABLISH .......... 0-150   Empty dashboard fades in + settles, holds so
//        the viewer reads the product (no orange "DEMO").
//  B  UPLOAD ............. 150-470  The UploadModal springs open AND the stage
//        ZOOMS IN (~1.4×) on it — BEFORE the cursor appears — so the viewer sees
//        what's about to be clicked. The dashboard hides as the modal opens (one
//        clean upload card, no doubled UI). The cursor then enters, moves to
//        "Browse files", clicks (424) → the receipt POPS at the click point (430)
//        and the modal is removed immediately. Stage zooms back out.
//        sub "Drop your receipt — any photo or PDF."  f210-430
//  C  EXTRACT ............ 430-960  The receipt glides + scales UP into the LEFT
//        column (470-566). Clean two-column focus view fades in (508-560):
//        receipt | OCR confirm panel (vertically centred). A "+" Gmail chip below
//        the receipt shows the inbox is an input too; an arrow points both sources
//        at the form. A glow bar SCANS the receipt (590-648); the OCR fields TYPE
//        in (Platform→Product→Price→Date, from 682). The "Ingest Agent · powered
//        by Gemini" badge names who's working.
//        sub "Gemini reads the merchant, item, date, and price."  f590-852
// ──────────────────────────────────────────────────────────────────────────────
import { ArrowRight } from "lucide-react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { AgentBadge } from "../../new-video/brand";
import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { useReveal } from "../../polish/RevealCard";
import { COLOR, TYPE } from "../../shots/_shared/tokens";
import { UiAppShellEmpty } from "../../uirefs";
import { UploadModal } from "../../uirefs/_pages";
import { OcrConfirmPanel } from "./OcrConfirmPanel";
import { RECEIPT_H, RECEIPT_W, ReceiptCard } from "./ReceiptCard";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ── Timeline anchors ──
const DASH_IN = [0, 26] as const;
const DASH_HIDE = [150, 172] as const; // dashboard hides as the modal opens
const MODAL_START = 150;
const POP_START = 430; // receipt pops at the click point
const MODAL_OUT = [430, 446] as const; // remove the upload card the instant it pops
const MOVE = [470, 566] as const;
const PC_IN = [508, 560] as const;
const SCAN = [590, 648] as const;
const ARROW_START = 656;
const FIELDS_T0 = 682;

// Readability zoom on the modal — engages WITH the modal (before the cursor),
// then back to 1.0 before the receipt glides into Phase C.
const ZOOM_MAX = 1.4;
const ZOOM = [150, 206, 438, 466] as const; // up-start, up-end, down-start, down-end

// Phase-C receipt placement (left column) + OCR panel (right column).
const RX_FROM = 960;
const RX_TO = 560;
const RY_FROM = 590; // pops at the modal "Browse files" click point
const RY_TO = 470; // moved up to make room for the Gmail chip below

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

  // Dashboard establishes (clean fade + soft blur settle), then hides as the
  // modal opens so its own upload card never doubles up with the modal.
  const dashOp = interpolate(frame, DASH_IN, [0, 1], C) * interpolate(frame, DASH_HIDE, [1, 0], C);
  const dashBlur = interpolate(frame, [0, 30], [6, 0], { ...C, easing: ease });

  // Readability zoom on the modal.
  const zoom = interpolate(
    frame,
    [0, ZOOM[0], ZOOM[1], ZOOM[2], ZOOM[3]],
    [1, 1, ZOOM_MAX, ZOOM_MAX, 1],
    { ...C, easing: ease },
  );

  // Modal open (spring overshoot) → removed the instant the receipt pops.
  const modalSpring = spring({
    frame: frame - MODAL_START,
    fps,
    config: { damping: 12, mass: 0.7, stiffness: 110 },
    durationInFrames: 36,
  });
  const modalScale = 0.94 + 0.06 * modalSpring;
  const modalOp =
    interpolate(frame, [MODAL_START + 2, MODAL_START + 22], [0, 1], C) *
    interpolate(frame, MODAL_OUT, [1, 0], C);

  // Receipt — pop (spring overshoot) at the click point → glide + grow left.
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

  // Gmail-integration chip + Ingest Agent badge reveals.
  const gmailOp = interpolate(frame, [604, 644], [0, 1], C);
  const gmailTy = interpolate(frame, [604, 644], [12, 0], { ...C, easing: ease });
  const ingestBadgeOp = interpolate(frame, [536, 576], [0, 1], C);

  return (
    <HookAtmosphere>
      {/* Zoomable stage — dashboard + modal + receipt + cursor scale together so
          the cursor always stays aligned with the UI it clicks. */}
      <AbsoluteFill
        style={{ transform: `scale(${zoom.toFixed(4)})`, transformOrigin: "960px 560px" }}
      >
        {/* Dashboard — establishes, then hides as the modal opens. */}
        {frame < DASH_HIDE[1] + 2 ? (
          <AbsoluteFill style={{ filter: `blur(${dashBlur.toFixed(2)}px)`, opacity: dashOp }}>
            <UiAppShellEmpty />
          </AbsoluteFill>
        ) : null}

        {/* Upload modal — the single, self-contained upload card. */}
        {frame >= MODAL_START && frame < MODAL_OUT[1] + 2 ? (
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

        {/* Cursor (B) — appears AFTER the zoom, moves to "Browse files", HOLDS
            through the click + receipt pop, then slides off. */}
        {frame >= 285 && frame < 470 ? (
          <Cursor
            keyframes={[
              { frame: 290, x: 1980, y: 1140 }, // off-screen bottom-right
              { frame: 388, x: 959, y: 599 }, // → modal "Browse files"
              { frame: 452, x: 959, y: 599 }, // HOLD through click (424) + pop (430)
              { frame: 468, x: 1010, y: 1150 }, // slide off-screen
            ]}
            clicks={[{ frame: 424 }]}
          />
        ) : null}
      </AbsoluteFill>

      {/* Phase C — clean two-column focus view (unzoomed): title + OCR panel +
          arrow + Gmail-integration chip. */}
      {frame >= PC_IN[0] ? (
        <AbsoluteFill style={{ opacity: pcP }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 134,
              textAlign: "center",
              transform: `translateY(${((1 - pcP) * 12).toFixed(1)}px)`,
            }}
          >
            <h1 className="text-2xl font-semibold text-neutral-900">Review purchase details</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Confirm the extracted information before ClaimIt starts monitoring.
            </p>
          </div>

          {/* OCR confirm panel — vertically centred in the right column. */}
          <div
            style={{
              position: "absolute",
              left: 912,
              top: 340,
              width: 608,
              transform: `translateY(${((1 - pcP) * 14).toFixed(1)}px)`,
            }}
          >
            <OcrConfirmPanel t0={FIELDS_T0} />
          </div>

          {/* Arrow — points the receipt + Gmail inbox at the form. */}
          <div
            style={{
              position: "absolute",
              left: 814,
              top: 486,
              opacity: arrowR.opacity,
              transform: `translateY(${arrowR.translateY.toFixed(1)}px) scale(${arrowR.scale.toFixed(3)})`,
            }}
          >
            <ArrowRight size={46} color={COLOR.NAVY} strokeWidth={2.4} aria-hidden />
          </div>

          {/* Gmail integration — receipt "+" Gmail inbox, both feeding the form. */}
          <div
            style={{
              position: "absolute",
              left: RX_TO,
              top: 756,
              transform: `translateX(-50%) translateY(${gmailTy.toFixed(1)}px)`,
              opacity: gmailOp,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 34, lineHeight: 1, color: COLOR.MUTE, fontWeight: 600 }}>+</div>
            <div
              style={{
                marginTop: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 20px",
                borderRadius: 999,
                background: COLOR.WHITE,
                border: `1px solid ${COLOR.LINE}`,
                boxShadow: "0 12px 30px rgba(20,30,50,0.08)",
              }}
            >
              <Img src={staticFile("brandlogos/gmail.svg")} style={{ height: 26 }} />
              <span style={{ ...TYPE.MICRO, fontSize: 21, fontWeight: 600, color: COLOR.INK }}>
                Gmail inbox
              </span>
            </div>
            <div style={{ ...TYPE.MICRO, fontSize: 16, color: COLOR.MUTE, marginTop: 8 }}>
              connected — reads receipts automatically
            </div>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Ingest Agent — large + conspicuous (it's the agent doing the extraction). */}
      <AgentBadge name="Ingest Agent" opacity={ingestBadgeOp} scale={1.4} top={36} />

      <BeatSubtitle
        text="Drop your receipt — any photo or PDF."
        fromFrame={210}
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
