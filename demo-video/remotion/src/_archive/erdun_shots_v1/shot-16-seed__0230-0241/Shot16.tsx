// SHOT 16 — Return to the seed · 2:30–2:41 · 660 f · Act IV · Dark
//
// REDESIGN-3 (v3 review). The old version showed only Sony chip +
// "+$50 reclaimed" — viewers didn't read it as "the chip came back
// with the money returned." New choreography is explicit:
//
//   f0–60   (1.0 s) — Sony chip fades up at canvas (760, 470) with
//                     the ORIGINAL price "$399.99" (back to the start).
//   f60–180 (2.0 s) — held alone. The viewer recognizes the chip
//                     from Shot 2.
//   f180–220 (0.67 s) — strikethrough sweeps L→R across "$399.99".
//   f220–260 (0.67 s) — "$349.99" appears underneath the struck price
//                     (opacity + y rise). The viewer sees the LOSS.
//   f260–340 (1.3 s) — held. Beat for the loss to register.
//   f340–400 (1.0 s) — "+$50.00" GREEN flies in from canvas-right to
//                     land beside the chip (x 1500→1180), bloom pulse.
//                     SECOND and last hero green of the film.
//   f400–460 (1.0 s) — green holds + "reclaimed" sub fades in below.
//   f460–520 (1.0 s) — "The $50 came back." closing line fades in
//                     at canvas (960, 720), DISPLAY_S white.
//   f520–620 (1.7 s) — full hold.
//   f620–660 (0.67 s) — fade out.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { DarkScene } from "../_shared/DarkScene";
import { DP16_CLOSE } from "../_shared/data";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

const CHIP_CX = 720;
const CHIP_CY = 470;
const CHIP_W = 480;
const CHIP_H = 100;
const PRICE_FROM_X = 1500;
const PRICE_TO_X = 1220;
const PRICE_CY = 470;

export const Shot16: React.FC = () => {
  const frame = useCurrentFrame();

  // Sony chip fade-up f0–40
  const chipFade = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const chipY = interpolate(frame, [0, 40], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Strikethrough sweep f180–220
  const strikeProgress = interpolate(frame, [180, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // $349.99 reveal underneath f220–260
  const newPriceOpacity = interpolate(frame, [220, 260], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const newPriceY = interpolate(frame, [220, 260], [8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Old price dim (still visible but de-emphasized after the new price arrives)
  const oldPriceDim = interpolate(frame, [220, 280], [1, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Green +$50.00 fly-in f340–400 (x slides 1500→1180, scale 0.9→1.0)
  const greenOpacity = interpolate(frame, [340, 400], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const greenX = interpolate(frame, [340, 400], [PRICE_FROM_X, PRICE_TO_X], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const greenScale = interpolate(frame, [340, 400], [0.9, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Green bloom pulse f340–460 (peaks at f380)
  const bloom = interpolate(frame, [340, 380, 460], [0, 0.55, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // "reclaimed" sub fades in f400–440
  const subFade = interpolate(frame, [400, 440], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Closing line "The $50 came back." f460–520
  const lineFade = interpolate(frame, [460, 520], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const lineY = interpolate(frame, [460, 520], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Out f620–660 fade
  const outFade = interpolate(frame, [620, 660], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return (
    <DarkScene>
      <AbsoluteFill style={{ opacity: outFade }}>
        {/* Sony chip — recap of Shot 2 C1, calmer border. */}
        <div
          style={{
            position: "absolute",
            left: CHIP_CX - CHIP_W / 2,
            top: CHIP_CY - CHIP_H / 2,
            width: CHIP_W,
            height: CHIP_H,
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
            opacity: chipFade,
            transform: `translateY(${chipY}px)`,
            padding: "0 24px",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div
            style={{
              ...TYPE.SUB,
              color: "#FFFFFF",
              opacity: 0.92,
              whiteSpace: "nowrap",
              maxWidth: 320,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Sony WH-1000XM5
          </div>
          {/* Price stack: $399.99 (struck) + $349.99 below */}
          <div
            style={{
              position: "relative",
              width: 110,
              height: 36,
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {/* Old price + strikethrough overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                ...TYPE.MICRO,
                color: COLOR.MUTE,
                opacity: oldPriceDim,
              }}
            >
              {DP16_CLOSE.sonyChipPaidPrice}
              {strikeProgress > 0 && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    height: 1,
                    width: `${strikeProgress * 100}%`,
                    background: COLOR.MUTE,
                    transformOrigin: "right center",
                  }}
                />
              )}
            </div>
            {/* New price (appears under the struck) */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 22,
                ...TYPE.MICRO,
                color: "#FFFFFF",
                opacity: newPriceOpacity,
                transform: `translateY(${newPriceY}px)`,
              }}
            >
              {DP16_CLOSE.sonyChipPrice}
            </div>
          </div>
        </div>

        {/* Green bloom behind +$50.00 */}
        {bloom > 0.001 && (
          <div
            style={{
              position: "absolute",
              left: greenX - 240,
              top: PRICE_CY - 240,
              width: 480,
              height: 480,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(29,122,58,0.85) 0%, transparent 60%)",
              opacity: bloom,
              filter: "blur(12px)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* +$50.00 GREEN — flies in from right */}
        <div
          style={{
            position: "absolute",
            left: greenX - 200,
            top: PRICE_CY - 56,
            width: 400,
            textAlign: "center",
            opacity: greenOpacity,
            transform: `scale(${greenScale.toFixed(5)})`,
            transformOrigin: "center center",
          }}
        >
          <div
            style={{
              ...TYPE.MONEY,
              fontSize: 96,
              color: COLOR.GREEN,
            }}
          >
            {DP16_CLOSE.sonyChipDelta}
          </div>
        </div>
        {/* "reclaimed" sub */}
        <div
          style={{
            position: "absolute",
            left: greenX - 200,
            top: PRICE_CY + 64,
            width: 400,
            textAlign: "center",
            ...TYPE.MICRO,
            color: COLOR.GREEN,
            opacity: subFade,
          }}
        >
          {DP16_CLOSE.sonyChipNote}
        </div>

        {/* Closing line "The $50 came back." */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 720 - 28,
            textAlign: "center",
            ...TYPE.DISPLAY_S,
            color: "#FFFFFF",
            opacity: lineFade,
            transform: `translateY(${lineY}px)`,
          }}
        >
          {DP16_CLOSE.lineThe50}
        </div>
      </AbsoluteFill>
    </DarkScene>
  );
};
