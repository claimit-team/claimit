// Single typed source for the 35 beat VO lines, mirrored from BEAT_SHEET.md v3.1.
// The actual data lives in vo_lines.json (so scripts/gen_vo.mjs can import
// it as plain JSON); this module re-exports it with proper types so Beat
// components and the audit script get full IntelliSense.
//
// To change a line:
//   1. Edit vo_lines.json (source of truth)
//   2. If text changes, regenerate the corresponding mp3 via gen_vo.mjs
//   3. Update BEAT_SHEET.md to match

import raw from "./vo_lines.json";

export type VoActKey =
  | "HOOK"
  | "ARCHITECTURE"
  | "REFUND"
  | "CREDIBILITY"
  | "IMPLEMENTATION_PROOF"
  | "PAYOFF";

export interface VoLine {
  /** mp3 base name (and beat slug prefix). Matches `vo_{id}.mp3`. */
  id: string;
  /** 1..35 ordinal in the master beat sheet (v3.1). */
  beatN: number;
  /** Section the beat lives in. */
  act: VoActKey;
  /** English VO text. null → silent beat, no mp3 generated. */
  text: string | null;
}

export const VO_LINES: readonly VoLine[] = raw as readonly VoLine[];

/** Convenience: beats that DO get an mp3. */
export const SPOKEN_VO_LINES: readonly (VoLine & { text: string })[] =
  VO_LINES.filter((v): v is VoLine & { text: string } => v.text !== null);

/** Convenience map: beatN → VoLine. */
export const VO_BY_BEAT: Readonly<Record<number, VoLine>> = Object.fromEntries(
  VO_LINES.map((v) => [v.beatN, v]),
);
