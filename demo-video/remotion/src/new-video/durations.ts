// New demo video (v2) — scene frame durations @ 60fps.
// Total MUST equal NEW_VIDEO_DURATION_F (3:00 = 10,800f).
//
// The middle "demo core" (workspace → approve → money) is one sequence
// so the real ClaimDetailShell mounts ONCE across those beats (mirrors
// Act III; avoids react-resizable-panels reflow on remount).

export const FPS = 60;

export const S1_HOOK_F = 720; //  0:00–0:12
export const S2_GAP_F = 840; //  0:12–0:26
export const S3_MEET_F = 720; //  0:26–0:38
export const S4_INGEST_F = 960; //  0:38–0:54  (Ingest agent)
export const S5_DROP_F = 960; //  0:54–1:10  (Monitor agent)
export const S6_DEMO_F = 3120; //  1:10–2:02  (Claim + Assistant agents)
export const S7_PLATFORMS_F = 960; //  2:02–2:18
export const S8_REACH_F = 600; //  2:18–2:28
export const S9_SPONSORS_F = 840; //  2:28–2:42  (sponsors / MCP)
export const S10_CLOSE_F = 1080; //  2:42–3:00

export const NEW_VIDEO_DURATION_F =
  S1_HOOK_F +
  S2_GAP_F +
  S3_MEET_F +
  S4_INGEST_F +
  S5_DROP_F +
  S6_DEMO_F +
  S7_PLATFORMS_F +
  S8_REACH_F +
  S9_SPONSORS_F +
  S10_CLOSE_F; // = 10,800
