// Beat-local FORK of peer's Scene08Reach — TECHSTACK PORTION ONLY.
// Peer's Scene08Reach (src/new-video) is a 1200f platform-logo wall + a small
// bottom "Built on …" tech strip (logos+labels, frames ~620+). This fork keeps
// ONLY that techstack portion, rebased to frame 0, and rebuilds it as a 3×3
// grid of RevealCards (logo + name + 1-line description, revealing together via
// the shared `useReveal`/`RevealCard` primitive) — EXTENDED with Arize Phoenix,
// which peer's version lacked. Peer's src/new-video is untouched.
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { RevealCard, useReveal } from "../../polish/RevealCard";
import { Camera } from "../../shots/_shared/Camera";
import { LightScene } from "../../shots/_shared/LightScene";
import { COLOR, EASE_UI, TYPE } from "../../shots/_shared/tokens";

const TECH_F = 300;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_UI } as const;

// Peer's 8 (Scene08Reach TECH list) + Arize Phoenix (new). Descriptions are
// CC-written in a consistent terse voice (peer's strip had labels only).
const TECH: { logo: string; name: string; description: string }[] = [
  { logo: "googlegemini.svg", name: "Gemini", description: "LLM reasoning + drafting" },
  { logo: "googlecloud.svg", name: "Google Cloud", description: "Compute + scheduling" },
  { logo: "mongodb.svg", name: "MongoDB", description: "Claim + purchase store" },
  { logo: "googlepubsub.svg", name: "Pub/Sub", description: "Event-driven workflow" },
  { logo: "elasticsearch.svg", name: "Elasticsearch", description: "Search" },
  { logo: "gmail.svg", name: "Gmail API", description: "Reads receipts · sends claims" },
  { logo: "nextdotjs.svg", name: "Next.js", description: "Web frontend" },
  { logo: "vercel.svg", name: "Vercel", description: "Deployment" },
  { logo: "phoenix.png", name: "Arize Phoenix", description: "Agent observability + tracing" },
];

export const Scene08ReachTechstack: React.FC = () => (
  <LightScene>
    <Camera from={1.0} to={1.012} startF={0} endF={TECH_F}>
      <Inner />
    </Camera>
  </LightScene>
);

const Inner: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useReveal(6);
  const outOp = interpolate(frame, [TECH_F - 50, TECH_F], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: outOp }}>
      {/* Headline (peer's tech-strip label, promoted to a heading) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 120,
          textAlign: "center",
          ...TYPE.DISPLAY_S,
          fontSize: 48,
          color: COLOR.NAVY,
          opacity: head.opacity,
          transform: `translateY(${head.translateY.toFixed(1)}px)`,
        }}
      >
        Built on Google Cloud + Gemini
      </div>

      {/* 3×3 techstack grid — each card's logo + name + description reveal together,
          staggered 8f (same inter-component cadence as ArchFlow). */}
      <div
        style={{
          position: "absolute",
          left: 160,
          right: 160,
          top: 250,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          rowGap: 56,
          columnGap: 40,
          justifyItems: "center",
        }}
      >
        {TECH.map((t, i) => (
          <RevealCard
            key={t.name}
            logo={t.logo}
            name={t.name}
            description={t.description}
            fromFrame={30 + i * 8}
            width={440}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
