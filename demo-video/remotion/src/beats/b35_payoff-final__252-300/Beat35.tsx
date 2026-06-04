// Beat 35 — Payoff · final brand · 2:52-3:00 · 480f (8s, longer hold)
// "ClaimIt. AI does the paperwork. You approve."
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { easings } from "../../polish/easings";
import { colors, FONT_STACK_TEXT } from "../../polish/tokens";

const POWERED = "Powered by Gemini ADK · MongoDB Atlas · Arize Phoenix";
const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export const Beat35: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const poweredChars = Math.max(0, Math.floor(interpolate(frame, [30, 60], [0, POWERED.length], C)));
  const teamIn = interpolate(frame, [60, 90], [0, 1], { ...C, easing: easings.easeOut });
  const logoSpring = spring({ frame: frame - 90, fps, config: { damping: 14, stiffness: 120 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.85, 1], C);
  const logoOpacity = (frame >= 90 ? 1 : 0) * interpolate(logoSpring, [0, 1], [0, 1], C);

  return (
    <HookAtmosphere>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: FONT_STACK_TEXT }}>
        <div
          style={{
            fontSize: 128,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: colors.brand.primary,
            opacity: logoOpacity,
            transform: `scale(${logoScale.toFixed(4)})`,
          }}
        >
          ClaimIt
        </div>
        <div style={{ height: 64 }} />
        <div style={{ fontSize: 22, fontWeight: 500, color: colors.text.dark, minHeight: 28 }}>
          {POWERED.slice(0, poweredChars)}
        </div>
        <div style={{ fontSize: 16, color: colors.text.muted, marginTop: 14, opacity: teamIn }}>
          Erdun · Raj · Will · Chris
        </div>
      </AbsoluteFill>
      <Sequence name="vo_b35" from={30}>
        <Audio src={staticFile("audio/vo/vo_b35.mp3")} />
      </Sequence>
      <BeatSubtitle
        text="ClaimIt. AI does the paperwork. You approve."
        fromFrame={30}
        durationFrames={220}
      />
    </HookAtmosphere>
  );
};
