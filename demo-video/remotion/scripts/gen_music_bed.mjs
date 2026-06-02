// Generate the full ~180 s warm-strings music bed.
//
// Strategy:
//   1. Try 180_000 ms in ONE call (within the ElevenLabs Music API
//      single-call cap of ~300 s per docs).
//   2. On HTTP failure citing length limits, fall back to two
//      segments of 90 s + 90 s with continuation guidance in the
//      second prompt, then ffmpeg-concat into one mp3.
//   3. On any other error, STOP and report — never silently switch
//      to a non-ElevenLabs source.
//
// Output: public/audio/music/claimit_music_bed.mp3 (mp3 44.1 kHz / 128 kbps)

import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FINAL_PATH = join(ROOT, "public/audio/music/claimit_music_bed.mp3");
const TMP_DIR = join(ROOT, "public/audio/music/.tmp");

const MODEL = "music_v1";
const OUTPUT_FORMAT = "mp3_44100_128";
const FULL_LENGTH_MS = 180_000;

const BASE_PROMPT =
  "Minimal cinematic film score led by warm sustained strings, intimate and restrained, with a quiet sense of hope and trust. Begins sparse and low — a few soft string notes and a gentle low pad — then very gradually swells to a fuller, warmer string arrangement toward the end, before settling back down to calm. No drums, no percussion, no beat, no build-and-drop, no vocals. Slow, spacious, emotional. Apple privacy-ad style. Instrumental only.";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey || apiKey.trim() === "") {
  console.error("ELEVENLABS_API_KEY missing — pass --env-file=.env");
  process.exit(1);
}

async function compose(prompt, lengthMs) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/music?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: lengthMs,
        model_id: MODEL,
      }),
    },
  );
  return res;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}`));
    });
  });
}

await mkdir(dirname(FINAL_PATH), { recursive: true });

// ──────────────────────────────────────────────────────────────────
// Attempt 1: single 180 s call
// ──────────────────────────────────────────────────────────────────
process.stdout.write(`[single-call] requesting ${FULL_LENGTH_MS} ms → `);
let res = await compose(BASE_PROMPT, FULL_LENGTH_MS);
if (res.ok) {
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(FINAL_PATH, buf);
  console.log(`${buf.length} bytes ok`);
  console.log(`Strategy: single 180 s call. Output: ${FINAL_PATH}`);
  process.exit(0);
}

const errBody = await res.text().catch(() => "");
process.stdout.write("FAIL\n");
console.error(`HTTP ${res.status} ${res.statusText}`);
console.error(errBody.slice(0, 600));

// Detect length-limit errors and fall back to multi-segment.
const lengthRelated =
  /length|duration|exceeds|max|limit|too long/i.test(errBody) ||
  res.status === 422 ||
  res.status === 400;
if (!lengthRelated) {
  console.error(
    "Error does not look length-related; stopping (no silent fallback to another music source).",
  );
  process.exit(2);
}

// ──────────────────────────────────────────────────────────────────
// Attempt 2: two segments × 90 s, ffmpeg-concat
// ──────────────────────────────────────────────────────────────────
console.error("\nFalling back to 2 × 90 s segments + ffmpeg concat.");
await mkdir(TMP_DIR, { recursive: true });

const SEG1_PROMPT =
  "Minimal cinematic film score led by warm sustained strings, intimate and restrained, with a quiet sense of hope and trust. Sparse and low throughout: only a few soft string notes and a gentle low pad, very spacious. This is the OPENING of a longer piece — quiet, patient, room to breathe. No drums, no percussion, no beat, no vocals. Apple privacy-ad style. Instrumental only.";
const SEG2_PROMPT =
  "Minimal cinematic film score led by warm sustained strings, the SAME warm string ensemble as before. This section gradually swells to a fuller, warmer string arrangement, hopeful and intimate, then settles back down to calm by the end. No drums, no percussion, no beat, no build-and-drop, no vocals. Slow, spacious, emotional. Apple privacy-ad style. Instrumental only.";
const SEG_LENGTH_MS = 90_000;

const segs = [
  { id: "seg1", prompt: SEG1_PROMPT },
  { id: "seg2", prompt: SEG2_PROMPT },
];
const segPaths = [];
for (const s of segs) {
  process.stdout.write(`[${s.id}] requesting ${SEG_LENGTH_MS} ms → `);
  const r = await compose(s.prompt, SEG_LENGTH_MS);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`HTTP ${r.status} ${r.statusText}`);
    console.error(body.slice(0, 600));
    process.exit(2);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const segPath = join(TMP_DIR, `${s.id}.mp3`);
  await writeFile(segPath, buf);
  segPaths.push(segPath);
  console.log(`${buf.length} bytes ok`);
}

// Concat with a 1.5 s crossfade so the boundary doesn't pop.
const concatListPath = join(TMP_DIR, "concat.txt");
await writeFile(
  concatListPath,
  segPaths.map((p) => `file '${p}'`).join("\n") + "\n",
);
console.log("Crossfading via ffmpeg acrossfade 1.5 s …");
await run("ffmpeg", [
  "-y",
  "-i",
  segPaths[0],
  "-i",
  segPaths[1],
  "-filter_complex",
  "[0:a][1:a]acrossfade=d=1.5:c1=tri:c2=tri",
  "-codec:a",
  "libmp3lame",
  "-b:a",
  "128k",
  "-ar",
  "44100",
  FINAL_PATH,
]);
await rm(TMP_DIR, { recursive: true, force: true });
console.log(`Strategy: 2 × 90 s + 1.5 s acrossfade. Output: ${FINAL_PATH}`);
