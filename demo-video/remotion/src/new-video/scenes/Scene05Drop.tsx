// Scene 5 — The Drop · 0:54–1:10 · 960f · light.
// The MONITOR AGENT watches the price. Reuses the REAL PriceChartLayer
// (Recharts): the line draws L→R, amber drop dots pop, the $349.99 label
// + caption land, then an "eligible · $50 back" pill confirms the policy.

import { BadgeCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { PriceChartLayer } from "../../acts/layers/PriceChartLayer";
import { Camera } from "../../shots/_shared/Camera";
import {
  DP5_PRICE_CAPTION,
  DP5_PRICE_HEADER,
  DP5_PRICE_PAID,
  DP5_PRICE_SERIES,
} from "../../shots/_shared/data";
import { LightScene } from "../../shots/_shared/LightScene";
import { Stage } from "../../shots/_shared/Stage";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { AgentBadge } from "../brand";
import { S5_DROP_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

const AMBER_DOT_COUNT = DP5_PRICE_SERIES.filter((p) => p.price < DP5_PRICE_PAID).length;

export const Scene05Drop: React.FC = () => {
  const frame = useCurrentFrame();

  const revealProgress = interpolate(frame, [70, 520], [0, 1], clamp);
  const refLineOpacity = interpolate(frame, [40, 120], [0, 1], clamp);

  // Each amber drop dot pops as it appears: tiny → overshoot ~1.9× → settle.
  // Staggered after the line draws past each point.
  const DOT_START = 300;
  const DOT_STAGGER = 34;
  let amberDotsVisible = 0;
  const dotScales: number[] = [];
  for (let k = 0; k < AMBER_DOT_COUNT; k++) {
    const d = frame - (DOT_START + k * DOT_STAGGER);
    if (d >= 0) amberDotsVisible = k + 1;
    dotScales[k] = interpolate(d, [0, 4, 12], [0.25, 1.9, 1], clamp);
  }

  const finalLabelOpacity = interpolate(frame, [540, 580], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [590, 640], [0, 1], clamp);

  // Eligibility pill (canvas space, true size)
  const pillOp = interpolate(frame, [680, 720], [0, 1], clamp);
  const pillY = interpolate(frame, [680, 720], [16, 0], clamp);
  const badgeOp = interpolate(frame, [12, 52], [0, 1], clamp);
  const outOp = interpolate(frame, [S5_DROP_F - 36, S5_DROP_F], [1, 0], clamp);

  return (
    <LightScene style={{ opacity: outOp }}>
      <Camera from={1.0} to={1.015} startF={0} endF={S5_DROP_F}>
        <Stage>
          <Stage.Layer opacity={1}>
            <PriceChartLayer
              header={DP5_PRICE_HEADER}
              caption={DP5_PRICE_CAPTION}
              series={DP5_PRICE_SERIES}
              pricePaid={DP5_PRICE_PAID}
              revealProgress={revealProgress}
              amberDotsVisible={amberDotsVisible}
              refLineOpacity={refLineOpacity}
              finalLabelOpacity={finalLabelOpacity}
              captionOpacity={captionOpacity}
              dotScales={dotScales}
            />
          </Stage.Layer>
        </Stage>
      </Camera>

      {/* Eligibility pill */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 980,
            display: "flex",
            justifyContent: "center",
            opacity: pillOp,
            transform: `translateY(${pillY}px)`,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 24px",
              borderRadius: 999,
              background: COLOR.NAVY,
              color: COLOR.WHITE,
              ...TYPE.SUB,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            <BadgeCheck size={26} color={COLOR.WHITE} />
            Best Buy policy checked — eligible for $50 back
          </div>
        </div>
      </AbsoluteFill>

      <AgentBadge name="Monitor Agent" opacity={badgeOp} />
    </LightScene>
  );
};
