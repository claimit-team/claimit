// New demo video (v2) — scene frame durations @ 60fps.
// Total MUST equal NEW_VIDEO_DURATION_F (3:00 = 10,800f).
//
// The middle "demo core" (workspace → approve → money) is one sequence
// so the real ClaimDetailShell mounts ONCE across those beats (mirrors
// Act III; avoids react-resizable-panels reflow on remount).

export const FPS = 60;

export const S1_HOOK_F = 720; //  0:00–0:12
export const S2_GAP_F = 1080; //  0:12–0:30
export const S3_MEET_F = 720; //  0:30–0:42
export const S4_INGEST_F = 960; //  0:42–0:58
export const S5_DROP_F = 960; //  0:58–1:14
export const S6_DEMO_F = 3120; //  1:14–2:06  (workspace 1800 + approve/money 1320)
export const S7_PLATFORMS_F = 960; //  2:06–2:22
export const S8_REACH_F = 1200; //  2:22–2:42
export const S9_CLOSE_F = 1080; //  2:42–3:00

// Demo-core internal sub-beats (local frames within S6).
export const S6_WORKSPACE_F = 1800; // local 0–1800: draft → evidence → assistant
export const S6_APPROVE_MONEY_F = 1320; // local 1800–3120: approve → money payoff

export const NEW_VIDEO_DURATION_F =
  S1_HOOK_F +
  S2_GAP_F +
  S3_MEET_F +
  S4_INGEST_F +
  S5_DROP_F +
  S6_DEMO_F +
  S7_PLATFORMS_F +
  S8_REACH_F +
  S9_CLOSE_F; // = 10,800
