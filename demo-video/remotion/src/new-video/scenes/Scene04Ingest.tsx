// Scene 4 — Ingest · 0:38–0:54 · 960f · light.
// Left: connect-Gmail badge + receipt dropzone (HeroNewUser look).
// Right: extracted fields fill in one by one, then "Now monitoring".
// Bottom: names the INGEST AGENT powering this step (powered by Gemini).

import { ArrowRight, CheckCircle2, Mail, UploadCloud } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";
import { GEMINI_GRADIENT_TEXT, GeminiSpark, GOOGLE_SANS } from "../brand";
import { S4_INGEST_F } from "../durations";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

const CARD_TOP = 250;
const CARD_H = 560;
const LEFT_X = 210;
const RIGHT_X = 1070;
const CARD_W = 640;

const FIELDS = [
  { label: "Brand", value: "Best Buy", at: 250 },
  { label: "Item", value: "Sony WH-1000XM5 Headphones", at: 320 },
  { label: "Price paid", value: "$399.99", at: 390 },
  { label: "Protection window", value: "15 days", at: 460 },
];

export const Scene04Ingest: React.FC = () => {
  return (
    <LightScene>
      <Camera from={1.0} to={1.012} startF={0} endF={S4_INGEST_F}>
        <Inner />
      </Camera>
    </LightScene>
  );
};

const Inner: React.FC = () => {
  const frame = useCurrentFrame();

  const leftOp = interpolate(frame, [6, 40], [0, 1], clamp);
  const leftY = interpolate(frame, [6, 40], [20, 0], clamp);
  const rightOp = interpolate(frame, [60, 96], [0, 1], clamp);
  const rightY = interpolate(frame, [60, 96], [20, 0], clamp);

  // Static flow arrow + bottom Gemini mark (no pulse, per feedback).
  const arrowOp = interpolate(frame, [120, 170], [0, 1], clamp);
  const geminiOp = interpolate(frame, [160, 215], [0, 1], clamp);
  const geminiY = interpolate(frame, [160, 215], [16, 0], clamp);

  // Monitoring confirmation
  const monOp = interpolate(frame, [600, 640], [0, 1], clamp);
  const monY = interpolate(frame, [600, 640], [14, 0], clamp);

  const outOp = interpolate(frame, [S4_INGEST_F - 36, S4_INGEST_F], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 150,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 44,
          color: COLOR.INK,
          opacity: leftOp,
        }}
      >
        Add a purchase in seconds.
      </div>

      {/* LEFT — ingest card */}
      <div
        style={{
          position: "absolute",
          left: LEFT_X,
          top: CARD_TOP,
          width: CARD_W,
          height: CARD_H,
          borderRadius: 18,
          background: COLOR.WHITE,
          border: `1px solid ${COLOR.LINE}`,
          boxShadow: "0 24px 60px rgba(20,30,50,0.08)",
          padding: 36,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 22,
          opacity: leftOp,
          transform: `translateY(${leftY}px)`,
        }}
      >
        {/* Gmail connected badge */}
        <div
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            borderRadius: 999,
            border: `1px solid ${COLOR.GREEN}`,
            color: COLOR.GREEN,
            background: COLOR.GREEN_05,
            ...TYPE.MICRO,
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          <Mail size={20} /> Gmail connected
        </div>

        <div style={{ ...TYPE.MICRO, fontSize: 18, color: COLOR.MUTE, textAlign: "center" }}>
          or upload a receipt
        </div>

        {/* Dropzone */}
        <div
          style={{
            flex: 1,
            border: `2px dashed ${COLOR.LINE}`,
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: COLOR.N50,
          }}
        >
          <UploadCloud size={56} color={COLOR.MUTE} />
          <div style={{ ...TYPE.SUB, fontSize: 26, fontWeight: 600, color: COLOR.INK }}>
            Drop your receipt
          </div>
          <div style={{ ...TYPE.MICRO, fontSize: 16, color: COLOR.MUTE }}>PDF, PNG, or JPG</div>
          <div
            style={{
              marginTop: 6,
              padding: "10px 20px",
              borderRadius: 10,
              background: COLOR.NAVY,
              color: COLOR.WHITE,
              ...TYPE.MICRO,
              fontSize: 17,
              fontWeight: 600,
            }}
          >
            Browse files
          </div>
        </div>
      </div>

      {/* CENTER — quiet static flow arrow */}
      <div
        style={{
          position: "absolute",
          left: 850,
          top: CARD_TOP + CARD_H / 2 - 24,
          width: 220,
          display: "flex",
          justifyContent: "center",
          opacity: arrowOp,
        }}
      >
        <ArrowRight size={48} color={COLOR.MUTE} />
      </div>

      {/* RIGHT — extracted fields */}
      <div
        style={{
          position: "absolute",
          left: RIGHT_X,
          top: CARD_TOP,
          width: CARD_W,
          height: CARD_H,
          borderRadius: 18,
          background: COLOR.WHITE,
          border: `1px solid ${COLOR.LINE}`,
          boxShadow: "0 24px 60px rgba(20,30,50,0.08)",
          padding: 36,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          opacity: rightOp,
          transform: `translateY(${rightY}px)`,
        }}
      >
        <div style={{ ...TYPE.SUB, fontSize: 24, fontWeight: 600, color: COLOR.INK }}>
          Extracted details
        </div>

        {FIELDS.map((f) => {
          const op = interpolate(frame, [f.at, f.at + 26], [0, 1], clamp);
          const ty = interpolate(frame, [f.at, f.at + 26], [10, 0], clamp);
          const checkOp = interpolate(frame, [f.at + 18, f.at + 40], [0, 1], clamp);
          return (
            <div
              key={f.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 16,
                borderBottom: `1px solid ${COLOR.LINE}`,
              }}
            >
              <span style={{ ...TYPE.MICRO, fontSize: 18, color: COLOR.MUTE }}>{f.label}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: op,
                  transform: `translateY(${ty}px)`,
                }}
              >
                <span style={{ ...TYPE.SUB, fontSize: 22, fontWeight: 600, color: COLOR.INK }}>
                  {f.value}
                </span>
                <CheckCircle2 size={20} color={COLOR.GREEN} style={{ opacity: checkOp }} />
              </span>
            </div>
          );
        })}

        {/* Monitoring confirmation */}
        <div
          style={{
            marginTop: "auto",
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 10,
            background: COLOR.NAVY_50,
            color: COLOR.NAVY,
            ...TYPE.MICRO,
            fontSize: 18,
            fontWeight: 600,
            opacity: monOp,
            transform: `translateY(${monY}px)`,
          }}
        >
          <CheckCircle2 size={20} color={COLOR.NAVY} /> Now monitoring — we'll watch the price for
          you.
        </div>
      </div>

      {/* Bottom mark — names the INGEST AGENT powering this step */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 854,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          opacity: geminiOp,
          transform: `translateY(${geminiY}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <GeminiSpark size={50} />
          <span
            style={{
              fontFamily: GOOGLE_SANS,
              fontSize: 54,
              fontWeight: 500,
              letterSpacing: "-1.5px",
              color: COLOR.INK,
            }}
          >
            Ingest Agent
          </span>
        </div>
        <span style={{ fontFamily: GOOGLE_SANS, fontSize: 26, fontWeight: 500 }}>
          <span style={{ color: COLOR.MUTE }}>powered by </span>
          <span style={GEMINI_GRADIENT_TEXT}>Gemini</span>
          <span style={{ color: COLOR.MUTE }}> — reads your receipt or email</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
