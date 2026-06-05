// SHOT 03 — The gap (57 / 7) · 0:12–0:18 · 360 f · Act I · Dark
// Two stat numbers + subs + footnote. Slow push-in 1.000→1.012.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../_shared/Camera";
import { DarkScene } from "../_shared/DarkScene";
import { DP2_GAP } from "../_shared/data";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

export const Shot03: React.FC = () => {
  return (
    <DarkScene>
      <Camera from={1.0} to={1.012} startF={0} endF={360}>
        <Inner />
      </Camera>
    </DarkScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  // 57% block
  const block57Fade = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const block57Y = interpolate(frame, [0, 30], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // 7% block
  const block7Fade = interpolate(frame, [120, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const block7Y = interpolate(frame, [120, 150], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  // 7% counts up 0→7 over f120–168
  const sevenValue = Math.round(
    interpolate(frame, [120, 168], [0, 7], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  // Footnote
  const footnoteOpacity = interpolate(frame, [200, 230], [0, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Fade-out tail f330–360
  const tailFade = interpolate(frame, [330, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  return (
    <AbsoluteFill style={{ opacity: tailFade }}>
      {/* 57% block, anchored center (640, 470) */}
      <StatBlock
        cx={640}
        cy={470}
        statValue={DP2_GAP.topNumber}
        statColor="#FFFFFF"
        subText={DP2_GAP.topLabel}
        fade={block57Fade}
        yShift={block57Y}
      />
      {/* 7% block, anchored center (1300, 470), amber */}
      <StatBlock
        cx={1300}
        cy={470}
        statValue={`${sevenValue}%`}
        statColor={COLOR.AMBER}
        subText={DP2_GAP.bottomLabel}
        fade={block7Fade}
        yShift={block7Y}
      />
      {/* Footnote */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 980,
          textAlign: "center",
          ...TYPE.FOOTNOTE,
          color: "#FFFFFF",
          opacity: footnoteOpacity,
        }}
      >
        {DP2_GAP.footnote}
      </div>
    </AbsoluteFill>
  );
};

const StatBlock: React.FC<{
  cx: number;
  cy: number;
  statValue: string;
  statColor: string;
  subText: string;
  fade: number;
  yShift: number;
}> = ({ cx, cy, statValue, statColor, subText, fade, yShift }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: cx - 400,
        width: 800,
        top: cy - 100, // approximate centering of 160px tall STAT
        textAlign: "center",
        opacity: fade,
        transform: `translateY(${yShift}px)`,
      }}
    >
      <div style={{ ...TYPE.STAT, color: statColor }}>{statValue}</div>
      <div style={{ ...TYPE.SUB, color: COLOR.MUTE, marginTop: 16 }}>{subText}</div>
    </div>
  );
};
