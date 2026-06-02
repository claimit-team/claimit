// Single source of truth for the audio + subtitle timeline.
//
// Frame numbers are GLOBAL (0..10800) at 60 fps. The three columns
// `specFrame / verifiedFrame / adoptedFrame` for the 10 SFX are kept
// here so the verification table in §H of the audio plan stays
// reproducible without re-running detect_sfx_frames.sh.
//
// VO end frames = startF + round(durationSeconds * 60). The
// ElevenLabs Music API call already pinned durations; this file
// codifies the placement decisions.

export interface VoTiming {
  /** Matches the mp3 base name in public/audio/vo/<id>.mp3 */
  id: string;
  /** Spoken text — also the subtitle copy when shown. */
  text: string;
  /** Start frame in the global composition. */
  startF: number;
  /** End frame (exclusive — the <Sequence> spans [startF, endF). */
  endF: number;
  /** True → render a subtitle for this VO segment. */
  showSubtitle: boolean;
  /** Shot id this VO targets (for the audit report). */
  shot: string;
}

export interface SfxTiming {
  /** Matches the mp3 base name in public/audio/sfx/<file>.mp3 */
  file: string;
  /** Audio length the file was generated at (seconds). */
  seconds: number;
  /** Number of frames the audio occupies (= ceil(seconds * 60)). */
  durF: number;
  /** Final adopted trigger frame. */
  f: number;
  /** Original SHOT_SPEC PART 6 value — kept for the audit report. */
  specF: number;
  /** Beat described in SHOT_SPEC PART 6 / our 3-column verification. */
  beat: string;
}

// ────────────────────────────────────────────────────────────────────
// VO segments — 17 lines, anchored per audio plan §C.
// ────────────────────────────────────────────────────────────────────
const fpsRound = (sec: number) => Math.round(sec * 60);

export const VO_TIMING: VoTiming[] = [
  {
    id: "vo_s02",
    shot: "S2",
    showSubtitle: true,
    text: "Every day, the things you buy quietly drop in price after you've paid. That difference? It's yours to claim — and it slips away unnoticed.",
    startF: 240,
    endF: 240 + fpsRound(7.616), // 697
  },
  {
    id: "vo_s03",
    shot: "S3",
    showSubtitle: false,
    text: "Most major retailers offer price adjustments. Almost no one ever claims one.",
    startF: 780,
    endF: 780 + fpsRound(4.365), // 1042
  },
  {
    id: "vo_s04",
    shot: "S4",
    showSubtitle: false,
    text: "Your Money, Still Yours.",
    startF: 1290, // syncs with S4 visual slogan reveal (local f210)
    endF: 1290 + fpsRound(1.533), // 1382
  },
  {
    id: "vo_s05",
    shot: "S5",
    showSubtitle: true,
    text: "ClaimIt watches what you buy. The moment the price drops, it prepares the claim for you — your way.",
    startF: 1740,
    endF: 1740 + fpsRound(5.526), // 2072
  },
  {
    id: "vo_s06",
    shot: "S6",
    showSubtitle: true,
    text: "It keeps monitoring the price long after checkout. The instant it falls, ClaimIt catches the drop automatically.",
    startF: 2220,
    endF: 2220 + fpsRound(5.991), // 2580
  },
  {
    id: "vo_s07",
    shot: "S7",
    showSubtitle: false,
    text: "Then it builds your claim, end to end.",
    startF: 2670,
    endF: 2670 + fpsRound(2.276), // 2807
  },
  {
    id: "vo_s08",
    shot: "S8",
    showSubtitle: true,
    text: "A complete, accurate request — written for you, citing the exact price-match policy, down to the difference owed.",
    startF: 3030,
    endF: 3030 + fpsRound(6.037), // 3392
  },
  {
    id: "vo_s09",
    shot: "S9",
    showSubtitle: true,
    text: "With the evidence attached: the price drop captured, the proof, and the matching policy clause.",
    startF: 3600,
    endF: 3600 + fpsRound(6.13), // 3968
  },
  {
    id: "vo_s10",
    shot: "S10",
    showSubtitle: true,
    text: "It explains exactly why the claim qualifies — and every step it takes is fully traceable.",
    startF: 4110,
    endF: 4110 + fpsRound(4.551), // 4383
  },
  {
    id: "vo_s11",
    shot: "S11",
    showSubtitle: false,
    text: "You review it. You approve it. Nothing is ever sent without you.",
    startF: 4650,
    endF: 4650 + fpsRound(3.344), // 4851
  },
  {
    id: "vo_s12",
    shot: "S12",
    showSubtitle: false,
    text: "Still yours.",
    startF: 5160, // MUST be ≥ 5120 (actual green moment per detection)
    endF: 5160 + fpsRound(1.068), // 5224
  },
  {
    id: "vo_s13",
    shot: "S13",
    showSubtitle: true,
    text: "Email, chat — whatever the platform actually requires, ClaimIt writes the right claim, in the right format, the right way.",
    startF: 5580,
    endF: 5580 + fpsRound(6.177), // 5951
  },
  {
    id: "vo_s14",
    shot: "S14",
    showSubtitle: true,
    text: "In-store, self-service — one agent that matches every platform's real process, and keeps you in control of each one.",
    startF: 6780,
    endF: 6780 + fpsRound(6.409), // 7165
  },
  {
    id: "vo_s15",
    shot: "S15",
    showSubtitle: true,
    text: "You approve every claim. Every step is traceable. ClaimIt prepares the claim — it doesn't promise the refund. It makes sure you can ask for it.",
    startF: 7920,
    endF: 7920 + fpsRound(7.198), // 8352
  },
  {
    id: "vo_s16",
    shot: "S16",
    showSubtitle: false,
    text: "And just like that — the fifty dollars came back.",
    startF: 9400, // MUST be ≥ 9400 (Shot 16 green flies in f340-400 local)
    endF: 9400 + fpsRound(2.833), // 9570
  },
  {
    id: "vo_s17",
    shot: "S17",
    showSubtitle: false,
    text: "Your Money. Still Yours.",
    startF: 9720,
    endF: 9720 + fpsRound(1.533), // 9812
  },
  {
    id: "vo_s17b",
    shot: "S17B",
    showSubtitle: false,
    text: "Built on Google Cloud, Gemini, and MongoDB.",
    startF: 10080,
    endF: 10080 + fpsRound(2.368), // 10222
  },
];

// ────────────────────────────────────────────────────────────────────
// SFX hits — 10 total. specF column lets the audit report show
// the spec/verified/adopted three-way comparison.
// ────────────────────────────────────────────────────────────────────
const sfxDur = (sec: number) => Math.ceil(sec * 60);

export const SFX_TIMING: SfxTiming[] = [
  {
    file: "sfx_pricedrop",
    seconds: 0.8,
    durF: sfxDur(0.8),
    f: 490,
    specF: 480,
    beat: "Sony price flips to $349.99 (amber tint detected at f490, code: showNewPrice = f492)",
  },
  {
    file: "sfx_tick",
    seconds: 0.5,
    durF: sfxDur(0.5),
    f: 840,
    specF: 840,
    beat: "S3 local f120 — '7%' stat starts revealing",
  },
  {
    file: "sfx_tick",
    seconds: 0.5,
    durF: sfxDur(0.5),
    f: 940,
    specF: 940,
    beat: "S3 local f220 — count completes, footnote enters",
  },
  {
    file: "sfx_logo",
    seconds: 1.2,
    durF: sfxDur(1.2),
    f: 1320,
    specF: 1320,
    beat: "S4 v3 mid-slogan-reveal (local f240, slogan f210-270)",
  },
  {
    file: "sfx_chartbottom",
    seconds: 0.8,
    durF: sfxDur(0.8),
    f: 2360,
    specF: 2360,
    beat: "S6 local f200 — line-draw completes + $349.99 label appears",
  },
  {
    file: "sfx_type",
    seconds: 0.5,
    durF: sfxDur(0.5),
    f: 3420,
    specF: 3420,
    beat: "S8 mid-amber-underline of typed '$50.00'",
  },
  {
    file: "sfx_approve",
    seconds: 0.8,
    durF: sfxDur(0.8),
    f: 4890,
    specF: 4860,
    beat: "Dialog backdrop fully cleared, Submitted badge flipped (brightness rose 224→247 across f4880-4890)",
  },
  {
    file: "sfx_money",
    seconds: 1.5,
    durF: sfxDur(1.5),
    f: 5120,
    specF: 5130,
    beat: "First frame where green dominates over amber in hero $50 region (G-R: -19 at f5110 → +26 at f5120)",
  },
  {
    file: "sfx_reclaim",
    seconds: 1.0,
    durF: sfxDur(1.0),
    f: 9300,
    specF: 9300,
    beat: "S16 'green $50 echo' beat (spec value retained per non-critical SFX rule)",
  },
  {
    file: "sfx_tagline",
    seconds: 1.2,
    durF: sfxDur(1.2),
    f: 9840,
    specF: 9840,
    beat: "S17 local f180 — tagline at full reveal during long hold",
  },
];

// ────────────────────────────────────────────────────────────────────
// Music + duck thresholds (mirror values in AudioMix.tsx for review)
// ────────────────────────────────────────────────────────────────────
export const MUSIC_BASE = 0.85;
export const MUSIC_DUCKED = 0.3;
export const MUSIC_S12_QUIET = 0.12;
export const DUCK_FADE_F = 8;
export const VO_VOLUME = 1.0;
export const SFX_VOLUME = 0.55;
export const SFX_MONEY_VOLUME = 0.85;

// Subtitle fade — 6-frame ease per user direction (no hard cut)
export const SUBTITLE_FADE_F = 6;
