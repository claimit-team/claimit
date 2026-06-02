// Generate the 18 narration mp3s via ElevenLabs TTS.
//
// Usage (from demo-video/remotion/):
//   node --env-file=.env scripts/gen_vo.mjs
//
// This script:
//   • Loads ELEVENLABS_API_KEY from .env via Node 20's --env-file flag
//     (never logs the key).
//   • POSTs each line to ElevenLabs TTS with voice Paige
//     (NDTYOmYEjbDIVCKB35i3), model eleven_multilingual_v2, mp3 44.1 kHz.
//   • Voice settings tuned sober / trustworthy: higher stability,
//     moderate style, speaker boost on.
//   • Writes each mp3 to public/audio/vo/<id>.mp3.
//   • STOPS on the first HTTP error so the user can investigate
//     before any more API spend.
//
// No audio mixing, no video integration. Output is just raw mp3 files.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/audio/vo");

const VOICE_ID = "NDTYOmYEjbDIVCKB35i3"; // Paige
const MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128"; // 44.1 kHz mp3, 128 kbps

// Voice settings — sober, calm, trustworthy (per user direction).
// stability higher → more consistent / less expressive.
// style moderate-low → less performative.
const VOICE_SETTINGS = {
  stability: 0.65,
  similarity_boost: 0.75,
  style: 0.3,
  use_speaker_boost: true,
};

const PROMPTS = [
  {
    id: "vo_s02",
    text:
      "Every day, the things you buy quietly drop in price after you've paid. That difference? It's yours to claim — and it slips away unnoticed.",
  },
  {
    id: "vo_s03",
    text:
      "Most major retailers offer price adjustments. Almost no one ever claims one.",
  },
  { id: "vo_s04", text: "Your Money, Still Yours." },
  {
    id: "vo_s05",
    text:
      "ClaimIt watches what you buy. The moment the price drops, it prepares the claim for you — your way.",
  },
  {
    id: "vo_s06",
    text:
      "It keeps monitoring the price long after checkout. The instant it falls, ClaimIt catches the drop automatically.",
  },
  { id: "vo_s07", text: "Then it builds your claim, end to end." },
  {
    id: "vo_s08",
    text:
      "A complete, accurate request — written for you, citing the exact price-match policy, down to the difference owed.",
  },
  {
    id: "vo_s09",
    text:
      "With the evidence attached: the price drop captured, the proof, and the matching policy clause.",
  },
  {
    id: "vo_s10",
    text:
      "It explains exactly why the claim qualifies — and every step it takes is fully traceable.",
  },
  {
    id: "vo_s11",
    text: "You review it. You approve it. Nothing is ever sent without you.",
  },
  { id: "vo_s12", text: "Still yours." },
  {
    id: "vo_s13",
    text:
      "Email, chat — whatever the platform actually requires, ClaimIt writes the right claim, in the right format, the right way.",
  },
  {
    id: "vo_s14",
    text:
      "In-store, self-service — one agent that matches every platform's real process, and keeps you in control of each one.",
  },
  {
    id: "vo_s15",
    text:
      "You approve every claim. Every step is traceable. ClaimIt prepares the claim — it doesn't promise the refund. It makes sure you can ask for it.",
  },
  {
    id: "vo_s16",
    text: "And just like that — the fifty dollars came back.",
  },
  { id: "vo_s17", text: "Your Money. Still Yours." },
  { id: "vo_s17b", text: "Built on Google Cloud, Gemini, and MongoDB." },
];

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey || apiKey.trim() === "") {
  console.error(
    "ELEVENLABS_API_KEY is empty. Did you save .env after pasting the key, and run with --env-file=.env?",
  );
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

let okCount = 0;
for (const p of PROMPTS) {
  const outPath = join(OUT_DIR, `${p.id}.mp3`);
  process.stdout.write(`[${p.id}] ${p.text.length} chars → `);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: p.text,
        model_id: MODEL,
        voice_settings: VOICE_SETTINGS,
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
    if (errBody) {
      // Truncate to avoid dumping anything unexpected.
      console.error(errBody.slice(0, 500));
    }
    console.error(
      `Stopped at ${p.id}. ${okCount} files written so far. No further calls made.`,
    );
    process.exit(2);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  okCount += 1;
  process.stdout.write(`${buf.length} bytes ok\n`);
}

console.log(`\nDone. ${okCount} mp3 files in ${OUT_DIR}.`);
