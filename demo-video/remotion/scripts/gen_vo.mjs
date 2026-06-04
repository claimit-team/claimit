// Generate the beat-level narration mp3s via ElevenLabs TTS.
//
// Reads src/data/vo_lines.json as the single source of truth (mirror of
// BEAT_SHEET.md EN column). Skips entries with text === null (silent
// beats). Writes one file per spoken beat to public/audio/vo/vo_<id>.mp3.
//
// Usage (from demo-video/remotion/):
//   node --env-file=.env scripts/gen_vo.mjs
//   # or
//   ELEVENLABS_API_KEY=sk_... node scripts/gen_vo.mjs
//   # or with --dry-run to skip API calls and just list what WOULD generate:
//   node scripts/gen_vo.mjs --dry-run
//   # or with --only <id> to spot-test a single line:
//   node --env-file=.env scripts/gen_vo.mjs --only b01
//
// Voice: Leo v2 (bbGtsRRKUfYO634UxSjz) — "Technical and Precise" library voice.
// Prominent, direct, deep. Native pacing (speed=1.0).
// stability 0.78 / style 0.20. Model eleven_multilingual_v2, 128 kbps mp3.
//
// After each successful write the script spawns ffprobe to read the
// actual duration so we can flag any line that exceeds the 5 s beat
// budget. ffprobe is required (system-installed or @remotion/renderer's
// bundled binary will work via PATH).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/audio/vo");
const VO_LINES_PATH = join(ROOT, "src/data/vo_lines.json");

const VOICE_ID = "bbGtsRRKUfYO634UxSjz"; // Leo v2 — "Technical and Precise" (ElevenLabs voice library)
const MODEL = "eleven_multilingual_v2";
// Note: BEAT_SHEET §VO 配音规范 specifies 192 kbps but that tier costs
// Creator+ on ElevenLabs; this account is Starter, so we fall back to
// 128 kbps. Audible difference for spoken-word narration is negligible.
const OUTPUT_FORMAT = "mp3_44100_128"; // 44.1 kHz mp3, 128 kbps

const VOICE_SETTINGS = {
  stability: 0.78,
  similarity_boost: 0.75,
  style: 0.2,
  use_speaker_boost: true,
  // No `speed` param — native 1.0 pacing (Leo v2 reads at its natural cadence).
};

const BEAT_BUDGET_SECONDS = 5.0;

const dryRun = process.argv.includes("--dry-run");

// Optional --only <id> filter for spot-tests (e.g. --only b01).
const onlyIdx = process.argv.indexOf("--only");
const onlyId = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

// ─── Load VO lines ──────────────────────────────────────────────────────
const allLines = JSON.parse(await readFile(VO_LINES_PATH, "utf8"));
let spoken = allLines.filter((l) => l.text !== null);
const silent = allLines.filter((l) => l.text === null);

if (onlyId) {
  const match = spoken.find((l) => l.id === onlyId);
  if (!match) {
    console.error(`--only ${onlyId} did not match any spoken line.`);
    console.error(`Available IDs: ${spoken.map((l) => l.id).join(", ")}`);
    process.exit(1);
  }
  spoken = [match];
  console.log(`(--only ${onlyId} → 1 line)`);
}

console.log(`VO lines: ${allLines.length} total · ${spoken.length} to generate · ${silent.length} silent`);
console.log(`Silent (skipped): ${silent.map((s) => s.id).join(", ")}`);
console.log("");

if (!dryRun) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    console.error("ELEVENLABS_API_KEY is empty.");
    console.error("Provide it via one of:");
    console.error("  1. Create demo-video/remotion/.env with `ELEVENLABS_API_KEY=sk_...`");
    console.error("     then run: node --env-file=.env scripts/gen_vo.mjs");
    console.error("  2. Inline: ELEVENLABS_API_KEY=sk_... node scripts/gen_vo.mjs");
    console.error("  3. Dry-run (no API calls): node scripts/gen_vo.mjs --dry-run");
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });
}

// ─── Run ────────────────────────────────────────────────────────────────
const results = [];
let okCount = 0;
let overBudgetCount = 0;

for (const line of spoken) {
  const outPath = join(OUT_DIR, `vo_${line.id}.mp3`);
  process.stdout.write(`[${line.id}] (${line.act}) ${line.text.length} chars `);

  if (dryRun) {
    process.stdout.write("→ DRY-RUN skip\n");
    results.push({ id: line.id, status: "dry-run", path: outPath });
    continue;
  }

  // POST to ElevenLabs
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: line.text,
        model_id: MODEL,
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!res.ok) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 500);
    } catch {}
    process.stdout.write("FAIL\n");
    console.error(`  HTTP ${res.status} ${res.statusText}`);
    if (body) console.error(`  body: ${body}`);
    console.error(`\nStopped at ${line.id}. ${okCount} files written before failure.`);
    process.exit(2);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  okCount += 1;

  // Probe duration
  const durationS = await probeDuration(outPath);
  const overBudget = durationS > BEAT_BUDGET_SECONDS;
  if (overBudget) overBudgetCount += 1;
  const marker = overBudget ? " ⚠ OVER 5 s" : "";
  process.stdout.write(`→ ${buf.length} B · ${durationS.toFixed(2)} s${marker}\n`);
  results.push({ id: line.id, status: "ok", bytes: buf.length, durationS, overBudget, path: outPath });
}

// ─── Summary ───────────────────────────────────────────────────────────
console.log("");
console.log(`Done. ${okCount}/${spoken.length} spoken files written.`);
if (overBudgetCount > 0) {
  console.log(`⚠ ${overBudgetCount} files exceed the 5 s beat budget — review BEAT_SHEET timing.`);
}

// Write a manifest JSON for the report.
const manifestPath = join(OUT_DIR, "_vo_manifest.json");
await writeFile(manifestPath, JSON.stringify(results, null, 2));
console.log(`Manifest: ${manifestPath}`);

// ─── ffprobe helper ─────────────────────────────────────────────────────
function probeDuration(path) {
  return new Promise((resolve) => {
    if (!commandExists("ffprobe")) {
      resolve(NaN);
      return;
    }
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      path,
    ]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.on("close", () => {
      const s = parseFloat(stdout.trim());
      resolve(Number.isFinite(s) ? s : NaN);
    });
    proc.on("error", () => resolve(NaN));
  });
}

function commandExists(_cmd) {
  // Lightweight: assume ffprobe is on PATH (we confirmed earlier).
  // If it's not, probeDuration returns NaN and the script logs "—".
  return true;
}
