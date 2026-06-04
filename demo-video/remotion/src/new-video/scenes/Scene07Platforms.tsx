// Scene 7 — Every Platform · 2:06–2:22 · 960f · light.
// Compressed four-claim-types showcase: reuses the REAL FourCardGridLayer
// (email · chat · in-store · self-service). All four land in a quick
// stagger, footers fade in, and the closing caption converges them.

import { interpolate, useCurrentFrame } from "remotion";

import { FourCardGridLayer } from "../../acts/layers/FourCardGridLayer";
import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { Stage } from "../../shots/_shared/Stage";
import { EASE_UI } from "../../shots/_shared/tokens";
import {
  type Act3FrameState,
  type Act3GridCellId,
  defaultAct3FrameState,
} from "../../shots/_shared/types";
import { S7_PLATFORMS_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;
const iv = (f: number, range: number[], out: number[]) => interpolate(f, range, out, clamp);

const ORDER: Act3GridCellId[] = [
  "email",
  "chat_script",
  "in_store_guide",
  "self_service_walkthrough",
];

function computeState(f: number): Act3FrameState {
  const s = defaultAct3FrameState();
  s.layers.fourCardGrid = 1;
  s.gridTopLabelOpacity = iv(f, [10, 50], [0, 1]);
  s.gridTopLabelY = iv(f, [10, 50], [16, 0]);

  ORDER.forEach((id, i) => {
    const at = 70 + i * 55;
    s.gridCellOpacity[id] = iv(f, [at, at + 30], [0, 1]);
    s.gridCellSharp[id] = iv(f, [at, at + 44], [0.35, 1]);
    s.gridCellFooterOpacity[id] = iv(f, [at + 150, at + 190], [0, 1]);
  });

  // gridClosingOpacity intentionally left at 0 — the small bottom caption
  // overlapped the lower cells, so it's removed per feedback.
  return s;
}

export const Scene07Platforms: React.FC = () => {
  const frame = useCurrentFrame();
  const state = computeState(frame);
  const outOp = iv(frame, [S7_PLATFORMS_F - 36, S7_PLATFORMS_F], [1, 0]);

  return (
    <LightScene style={{ opacity: outOp }}>
      <Camera from={1.0} to={1.012} startF={0} endF={S7_PLATFORMS_F}>
        <Stage>
          <Stage.Layer opacity={1}>
            <FourCardGridLayer state={state} />
          </Stage.Layer>
        </Stage>
      </Camera>
    </LightScene>
  );
};
