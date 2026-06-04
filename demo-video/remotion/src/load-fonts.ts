// Font loading — per VIDEO_PRODUCTION_BIBLE.md §IV.1.
// loadFont() registers an @font-face with display:block and gates the
// renderer behind font readiness so no frame paints with a fallback.
//
// Imported as a side-effect at the top of Root.tsx (before any
// Composition is registered). Only the weights we actually use are
// loaded — keeps cold-start under 200 KB total font payload.

import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

loadFont({
  family: "Inter",
  url: staticFile("fonts/inter-latin-400-normal.woff2"),
  weight: "400",
  format: "woff2",
  display: "block",
});

loadFont({
  family: "Inter",
  url: staticFile("fonts/inter-latin-500-normal.woff2"),
  weight: "500",
  format: "woff2",
  display: "block",
});

loadFont({
  family: "Inter",
  url: staticFile("fonts/inter-latin-600-normal.woff2"),
  weight: "600",
  format: "woff2",
  display: "block",
});

loadFont({
  family: "Inter",
  url: staticFile("fonts/inter-latin-700-normal.woff2"),
  weight: "700",
  format: "woff2",
  display: "block",
});

export const INTER_STACK = `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
