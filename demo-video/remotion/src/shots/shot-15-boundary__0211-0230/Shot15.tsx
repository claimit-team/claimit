// SHOT 15 — The honest boundary · 2:11–2:30 · 1140 f · Act IV ·
// Light → begins darkening at f980. Three trust lines stagger in.

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../_shared/Camera";
import { DarkScene } from "../_shared/DarkScene";
import { DP15_TRUST } from "../_shared/data";
import { LightScene } from "../_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../_shared/tokens";

interface TrustLineProps {
  y: number;
  text: string;
  startF: number;
  cropHint: string;
}

const Line: React.FC<TrustLineProps> = ({ y, text, startF, cropHint }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [startF, startF + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  const yRise = interpolate(frame, [startF, startF + 40], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y - 28,
        textAlign: "center",
        opacity: fade,
        transform: `translateY(${yRise}px)`,
      }}
    >
      <div style={{ ...TYPE.DISPLAY_S, color: COLOR.INK }}>{text}</div>
      <div
        style={{
          marginTop: 16,
          display: "inline-block",
          padding: "6px 12px",
          borderRadius: 6,
          border: `1px solid ${COLOR.LINE}`,
          background: COLOR.WHITE,
          ...TYPE.MICRO,
          color: COLOR.MUTE,
        }}
      >
        {cropHint}
      </div>
    </div>
  );
};

export const Shot15: React.FC = () => {
  const frame = useCurrentFrame();

  // Closing line
  const closingFade = interpolate(frame, [520, 580], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Light→Dark luminance fall f980–1140
  const bgT = interpolate(frame, [980, 1140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Text fade-out f1020–1140
  const textOut = interpolate(frame, [1020, 1140], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_UI,
  });

  // Background color interpolation #F9FAFB → #0A0A0A
  const bgR = Math.round(249 + (10 - 249) * bgT);
  const bgG = Math.round(250 + (10 - 250) * bgT);
  const bgB = Math.round(251 + (10 - 251) * bgT);
  const bg = `rgb(${bgR}, ${bgG}, ${bgB})`;

  return (
    <AbsoluteFill style={{ background: bg }}>
      {bgT < 0.5 ? (
        <LightScene style={{ background: "transparent" }}>{null}</LightScene>
      ) : (
        <DarkScene
          style={{ background: "transparent" }}
          lightOpacity={0.07 * bgT}
          noGrain={bgT < 0.5}
        >
          {null}
        </DarkScene>
      )}
      <Camera from={1.0} to={1.01} startF={0} endF={980}>
        <AbsoluteFill style={{ opacity: textOut }}>
          <Line
            y={360}
            text={DP15_TRUST.lines[0]}
            startF={0}
            cropHint="Approve each claim · radio"
          />
          <Line
            y={500}
            text={DP15_TRUST.lines[1]}
            startF={160}
            cropHint="Tools · get_reasoning_trace · View trace"
          />
          <Line
            y={640}
            text={DP15_TRUST.lines[2]}
            startF={320}
            cropHint="gmail.readonly · gmail.send"
          />
          <div
            style={{
              position: "absolute",
              left: 160,
              right: 160,
              top: 820 - 20,
              textAlign: "center",
              ...TYPE.SUB,
              color: COLOR.BODY,
              opacity: closingFade,
            }}
          >
            {DP15_TRUST.closing}
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
