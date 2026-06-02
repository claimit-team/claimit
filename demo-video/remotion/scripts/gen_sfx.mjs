// Generate the 9 SFX mp3s via ElevenLabs Sound Effects API.
//
// Usage:
//   node --env-file=.env scripts/gen_sfx.mjs
//
// Endpoint (verified against docs 2026-06-02):
//   POST https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128
//   body: { text, duration_seconds (0.5–30), model_id: "eleven_text_to_sound_v2" }
//   response: binary mp3 (application/octet-stream)
//
// On any non-200 response: print the error body and STOP — no silent
// fallback to a different model / non-ElevenLabs source.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/audio/sfx");

const MODEL = "eleven_text_to_sound_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

const PROMPTS = [
  {
    id: "sfx_pricedrop",
    seconds: 0.8,
    text:
      "soft low descending tone, gentle, warm, short, subtle price-drop cue, no harsh attack",
  },
  {
    id: "sfx_tick",
    seconds: 0.5,
    text: "very soft single UI tick, warm, brief, understated",
  },
  {
    id: "sfx_logo",
    seconds: 1.2,
    text:
      "soft warm swell, gentle rising pad bloom, short, elegant brand-reveal cue, no impact",
  },
  {
    id: "sfx_chartbottom",
    seconds: 0.8,
    text:
      "soft gentle ding, warm, single note, subtle, data point reached",
  },
  {
    id: "sfx_type",
    seconds: 0.5,
    text:
      "very soft subtle keystroke mark, warm, brief, understated",
  },
  {
    id: "sfx_approve",
    seconds: 0.8,
    text:
      "soft confident confirmation tone, warm, short, satisfying but gentle, no harsh beep",
  },
  {
    id: "sfx_money",
    seconds: 1.5,
    text:
      "warm gentle resonant chime, hopeful, soft bloom, the most emotional positive cue, ~1.5s, no harsh attack",
  },
  {
    id: "sfx_reclaim",
    seconds: 1.0,
    text: "soft warm echo of a gentle chime, faint, distant, brief",
  },
  {
    id: "sfx_tagline",
    seconds: 1.2,
    text:
      "soft warm closing swell, gentle, short, elegant, settling",
  },
];

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey || apiKey.trim() === "") {
  console.error("ELEVENLABS_API_KEY missing — pass --env-file=.env");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

for (const p of PROMPTS) {
  const outPath = join(OUT_DIR, `${p.id}.mp3`);
  process.stdout.write(`[${p.id}] ${p.seconds}s · "${p.text.slice(0, 40)}…" → `);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/sound-generation?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: p.text,
        duration_seconds: p.seconds,
        model_id: MODEL,
      }),
    },
  );
  if (!res.ok) {
    let errBody = "";
    try {
      errBody = await res.text();
    } catch {}
    process.stdout.write("FAIL\n");
    console.error(`HTTP ${res.status} ${res.statusText}`);
    if (errBody) console.error(errBody.slice(0, 800));
    console.error(`Stopped at ${p.id}.`);
    process.exit(2);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  process.stdout.write(`${buf.length} bytes ok\n`);
}

console.log(`\nDone. 9 SFX in ${OUT_DIR}.`);
