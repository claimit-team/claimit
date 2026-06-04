// SHOT_SPEC PART 2 — exact frame durations per shot @ 60 fps.
// Total must equal 10800.

export const SHOT_01_DURATION_F = 180; // 0:00–0:03
export const SHOT_02_DURATION_F = 540; // 0:03–0:12
export const SHOT_03_DURATION_F = 360; // 0:12–0:18
export const SHOT_04_DURATION_F = 600; // 0:18–0:28
export const SHOT_05_DURATION_F = 480; // 0:28–0:36
export const SHOT_06_DURATION_F = 480; // 0:36–0:44
export const SHOT_07_DURATION_F = 300; // 0:44–0:49
export const SHOT_08_DURATION_F = 600; // 0:49–0:59
export const SHOT_09_DURATION_F = 480; // 0:59–1:07
export const SHOT_10_DURATION_F = 600; // 1:07–1:17
export const SHOT_11_DURATION_F = 420; // 1:17–1:24
export const SHOT_12_DURATION_F = 480; // 1:24–1:32
export const SHOT_13_DURATION_F = 1200; // 1:32–1:52
export const SHOT_14_DURATION_F = 1140; // 1:52–2:11
export const SHOT_15_DURATION_F = 1140; // 2:11–2:30
export const SHOT_16_DURATION_F = 660; // 2:30–2:41
// REDESIGN-4 (v3 review): closing trio repartitioned. The combined
// 1140 f budget of the old Shot 17 + Shot 18 now splits as:
//   Shot 17  · slogan    · 360 f / 6 s
//   Shot 17B · tech wall · 420 f / 7 s   (NEW)
//   Shot 18  · headshot  · 360 f / 6 s
// Total stays 1140 f, so Act IV (2940) + global (10800) unchanged.
export const SHOT_17_DURATION_F = 360; // 2:41–2:47
export const SHOT_17B_DURATION_F = 420; // 2:47–2:54
export const SHOT_18_DURATION_F = 360; // 2:54–3:00

export const ACT_I_DURATION_F = SHOT_01_DURATION_F + SHOT_02_DURATION_F + SHOT_03_DURATION_F; // 1080
export const ACT_II_DURATION_F = SHOT_04_DURATION_F + SHOT_05_DURATION_F; // 1080
export const ACT_III_DURATION_F =
  SHOT_06_DURATION_F +
  SHOT_07_DURATION_F +
  SHOT_08_DURATION_F +
  SHOT_09_DURATION_F +
  SHOT_10_DURATION_F +
  SHOT_11_DURATION_F +
  SHOT_12_DURATION_F +
  SHOT_13_DURATION_F +
  SHOT_14_DURATION_F; // 5700
export const ACT_IV_DURATION_F =
  SHOT_15_DURATION_F +
  SHOT_16_DURATION_F +
  SHOT_17_DURATION_F +
  SHOT_17B_DURATION_F +
  SHOT_18_DURATION_F; // 2940 (1140 + 660 + 360 + 420 + 360)

export const TOTAL_DURATION_F =
  ACT_I_DURATION_F + ACT_II_DURATION_F + ACT_III_DURATION_F + ACT_IV_DURATION_F; // 10800

// Act III shot offsets (Act-local frame 0 = first frame of Shot 6)
export const ACT_III_SHOT_OFFSETS = {
  shot06: 0,
  shot07: SHOT_06_DURATION_F,
  shot08: SHOT_06_DURATION_F + SHOT_07_DURATION_F,
  shot09: SHOT_06_DURATION_F + SHOT_07_DURATION_F + SHOT_08_DURATION_F,
  shot10: SHOT_06_DURATION_F + SHOT_07_DURATION_F + SHOT_08_DURATION_F + SHOT_09_DURATION_F,
  shot11:
    SHOT_06_DURATION_F +
    SHOT_07_DURATION_F +
    SHOT_08_DURATION_F +
    SHOT_09_DURATION_F +
    SHOT_10_DURATION_F,
  shot12:
    SHOT_06_DURATION_F +
    SHOT_07_DURATION_F +
    SHOT_08_DURATION_F +
    SHOT_09_DURATION_F +
    SHOT_10_DURATION_F +
    SHOT_11_DURATION_F,
  shot13:
    SHOT_06_DURATION_F +
    SHOT_07_DURATION_F +
    SHOT_08_DURATION_F +
    SHOT_09_DURATION_F +
    SHOT_10_DURATION_F +
    SHOT_11_DURATION_F +
    SHOT_12_DURATION_F,
  shot14:
    SHOT_06_DURATION_F +
    SHOT_07_DURATION_F +
    SHOT_08_DURATION_F +
    SHOT_09_DURATION_F +
    SHOT_10_DURATION_F +
    SHOT_11_DURATION_F +
    SHOT_12_DURATION_F +
    SHOT_13_DURATION_F,
} as const;
