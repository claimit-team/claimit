// Beat 08 — DEMO · 3-panel ClaimShell (draft · evidence · assistant) · ~19s / 1150f.
// Consolidates b19-b26 (draft → ask tone → rewrite → approve → sent) pending
// review; b19-b26 left intact. Clean focus view (no app shell). Cursor for the
// chat/send/approve clicks. All motion frame-driven (JITTER-GUARD safe).
//
// ─────────────────────────── STORYBOARD (frames @60fps) ───────────────────────
//  A  ENTRY ............ 0-90    shell fades in + scales 0.88 → 1.0 (easeOut).
//  B  INTRO (blur walk)  90-450  focus walks Draft→Evidence→Assistant; the other
//        two panes blur; a minimal caption labels each.  ~120f each (peer pace).
//        sub "Three panels — draft, evidence, and an assistant."  f110-360
//  C  AUTO-DRAFT ....... 450-630 focus Draft; Gemini's v1 email TYPEWRITERS in.
//        sub "Gemini drafts the first version."  f470-650
//  D  CHAT → REDRAFT ... 630-980 THE MOMENT. Cursor → chat input, types "Make it
//        friendlier", clicks send; assistant replies; then the LEFT draft panel
//        auto-rewrites to the friendlier v2 (fade + fast retype).
//        sub "Ask the assistant — it rewrites the draft for you."  f690-960
//  E  APPROVE + SENT ... 980-1090 cursor → "Approve and send", click → status
//        flips Submitted + a blue "Sent to Costco" toast (b07 toast style).
//        sub "One tap to send."  f1035-1115
//  F  EXIT ............. 1090-1150 fade to 0. Creep zoom 1.0 → 1.04 throughout.
// ──────────────────────────────────────────────────────────────────────────────
import { TrendingDown } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

import { BeatSubtitle } from "../../polish/BeatSubtitle";
import { Cursor } from "../../polish/Cursor";
import { easings } from "../../polish/easings";
import { HookAtmosphere } from "../../polish/HookAtmosphere";
import { DRAFT_V1, DRAFT_V2 } from "../../uirefs/_data";
import { type ChatMsg, ClaimShellClean } from "./ClaimShellClean";

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const BRAND_BLUE = "#27466E";
const MAKE_FRIENDLIER = "Make it friendlier";
const REPLY = "Sure — I'll soften the tone and resend.";

const V1_END = 470 + Math.ceil(DRAFT_V1.length / 2.2);
const V2_END = 862 + Math.ceil(DRAFT_V2.length / 3.2);

const iv = (frame: number, r: number[], o: number[], easing?: (n: number) => number) =>
  interpolate(frame, r, o, easing ? { ...C, easing } : C);

export const Beat08: React.FC = () => {
  const frame = useCurrentFrame();

  // Entry + creep zoom + exit fade.
  const entry = interpolate(frame, [0, 40], [0.88, 1.0], { ...C, easing: easings.easeOut });
  const creep = interpolate(frame, [90, 600, 1090, 1150], [1.0, 1.02, 1.035, 1.04], C);
  const scale = frame < 90 ? entry : creep;
  const opacity = iv(frame, [0, 30], [0, 1]) * iv(frame, [1090, 1145], [1, 0], easings.easeIn);

  // Per-pane focus (1 = sharp, low = blurred). Walks during the intro, then
  // tracks the active pane through draft / chat / redraft.
  const draftF = iv(
    frame,
    [90, 200, 230, 450, 470, 630, 655, 845, 862, 1150],
    [1, 1, 0.22, 0.22, 1, 1, 0.45, 0.45, 1, 1],
  );
  const eviF = iv(
    frame,
    [88, 110, 205, 230, 315, 340, 470, 960, 985, 1150],
    [1, 0.22, 0.22, 1, 1, 0.22, 0.35, 0.3, 1, 1],
  );
  const asstF = iv(
    frame,
    [88, 110, 320, 345, 450, 475, 640, 660, 845, 865, 960, 985, 1150],
    [1, 0.22, 0.22, 1, 1, 0.35, 0.35, 1, 1, 0.5, 0.5, 1, 1],
  );

  // Draft body — v1 typewriter (C), then auto-rewrite to v2 (D).
  let draftText: string;
  let versionLabel: string;
  let draftCaret: boolean;
  if (frame < 855) {
    draftText = DRAFT_V1.slice(0, Math.floor(iv(frame, [470, V1_END], [0, DRAFT_V1.length])));
    versionLabel = "v1 · AI draft · 5 minutes ago";
    draftCaret = frame >= 470 && frame < V1_END + 8;
  } else {
    draftText = DRAFT_V2.slice(0, Math.floor(iv(frame, [862, V2_END], [0, DRAFT_V2.length])));
    versionLabel = "v2 · Assistant rewrite · just now";
    draftCaret = frame >= 862 && frame < V2_END + 8;
  }
  const draftBodyOpacity = iv(frame, [848, 856, 866], [1, 0.2, 1]);

  // Chat input + thread.
  const chatTyping = frame >= 716 && frame < 778;
  const chatText = chatTyping
    ? MAKE_FRIENDLIER.slice(0, Math.floor(iv(frame, [716, 730], [0, MAKE_FRIENDLIER.length])))
    : "";
  const messages: ChatMsg[] = [];
  if (frame >= 778) messages.push({ role: "user", text: MAKE_FRIENDLIER });
  if (frame >= 792) {
    const n = Math.floor(iv(frame, [792, 818], [0, REPLY.length]));
    messages.push({
      role: "assistant",
      text: REPLY.slice(0, n),
      caret: frame < 826,
      tool: frame >= 820 ? "request_redraft" : undefined,
    });
  }

  const sendActive = frame >= 770 && frame <= 790;
  const status = frame >= 1052 ? "submitted" : "awaiting_approval";
  const approveActive = frame >= 1040 && frame <= 1062;
  const toastP = iv(frame, [1052, 1068], [0, 1]);

  // Intro captions (minimal labels near each focused pane).
  const capDraft = iv(frame, [100, 116], [0, 1]) * iv(frame, [200, 214], [1, 0]);
  const capEvi = iv(frame, [214, 230], [0, 1]) * iv(frame, [320, 334], [1, 0]);
  const capAsst = iv(frame, [334, 350], [0, 1]) * iv(frame, [440, 454], [1, 0]);

  return (
    <HookAtmosphere>
      <AbsoluteFill
        style={{
          opacity,
          transform: `scale(${scale.toFixed(4)})`,
          transformOrigin: "center center",
        }}
      >
        <ClaimShellClean
          draftText={draftText}
          draftCaret={draftCaret}
          versionLabel={versionLabel}
          draftBodyOpacity={draftBodyOpacity}
          focus={{ draft: draftF, evidence: eviF, assistant: asstF }}
          messages={messages}
          chatText={chatText}
          chatCaret={chatTyping}
          sendActive={sendActive}
          status={status}
          approveActive={approveActive}
        />

        {/* Intro captions */}
        <Caption x={440} y={86} text="Draft" opacity={capDraft} />
        <Caption x={1270} y={86} text="Evidence" opacity={capEvi} />
        <Caption x={1270} y={988} text="Assistant" opacity={capAsst} />

        {/* Sent toast — blue iOS-push feel (matches b07) */}
        {toastP > 0.01 ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 84,
              display: "flex",
              justifyContent: "center",
              opacity: toastP,
              transform: `translateY(${((1 - toastP) * 20).toFixed(1)}px)`,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 20px",
                borderRadius: 16,
                background: BRAND_BLUE,
                color: "#FFFFFF",
                boxShadow: "0 16px 40px rgba(15,23,42,0.28)",
                fontFamily: '"Inter", system-ui, sans-serif',
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.16)",
                }}
              >
                <TrendingDown className="size-4" color="#FFFFFF" />
              </span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                Sent to Costco — claim submitted
              </span>
            </div>
          </div>
        ) : null}
      </AbsoluteFill>

      {/* Cursor — chat input click, send click, approve click (D + E only). */}
      {frame >= 630 && frame < 1080 ? (
        <Cursor
          keyframes={[
            { frame: 635, x: 1840, y: 1020 },
            { frame: 700, x: 1180, y: 902 }, // chat input
            { frame: 752, x: 1180, y: 902 },
            { frame: 776, x: 1690, y: 902 }, // send
            { frame: 985, x: 1690, y: 902 }, // hold through reply + redraft
            { frame: 1038, x: 1640, y: 168 }, // approve
            { frame: 1075, x: 1640, y: 168 },
          ]}
          clicks={[{ frame: 712 }, { frame: 776 }, { frame: 1045 }]}
        />
      ) : null}

      <BeatSubtitle
        text="Three panels — draft, evidence, and an assistant."
        fromFrame={110}
        durationFrames={250}
      />
      <BeatSubtitle text="Gemini drafts the first version." fromFrame={470} durationFrames={180} />
      <BeatSubtitle
        text="Ask the assistant — it rewrites the draft for you."
        fromFrame={690}
        durationFrames={270}
      />
      <BeatSubtitle text="One tap to send." fromFrame={1035} durationFrames={80} />
    </HookAtmosphere>
  );
};

const Caption: React.FC<{ x: number; y: number; text: string; opacity: number }> = ({
  x,
  y,
  text,
  opacity,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: "translateX(-50%)",
      opacity,
      fontFamily: '"Inter", system-ui, sans-serif',
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: -0.3,
      color: BRAND_BLUE,
    }}
  >
    {text}
  </div>
);
