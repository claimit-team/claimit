// Inter font is registered via @font-face in globals.css with
// `font-display: block` and served from public/fonts/. Local bundling
// means the woff2 files ship with the Remotion bundle — no network
// request, no timeout risk.
//
// Earlier versions used delayRender + document.fonts.ready to gate the
// first frame; that timed out unreliably during long video renders even
// though the font was actually available. Since `font-display: block`
// already makes the browser wait for the font before painting any text
// that uses it, the additional delayRender is redundant and harmful.

export const INTER_FONT_FAMILY = "Inter";
export const INTER_STACK = `Inter, system-ui, -apple-system, sans-serif`;
