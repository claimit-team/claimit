// MoneyUnderlineOverlay — Shot 8 amber underline on the typed
// "$50.00" in the DraftPane email preview.
//
// Strategy: after the real DraftPane renders the typed body, we use
// a DOM `Range` to locate the substring "$50.00" inside the body's
// rendered text node, compute its bounding rect, and draw a 1-px
// amber underline at the rect's bottom edge. The lookup runs each
// frame because the typed-chars value changes; once "$50.00" is
// present, the rect is stable until layout shifts.
//
// Per SHOT_SPEC §3 Shot 8 Notes, the spec accepts a simpler
// "tint the substring amber for 18 frames" fallback if glyph-
// accurate alignment proves unreliable. The Range approach is
// preferred; a fallback `<StampFallback>` is available below.

import { useEffect, useRef, useState } from "react";

import { COLOR } from "../../shots/_shared/tokens";

interface Props {
  /** 0..1 underline opacity (set by Shot 8's frame state, peaks at f470–488). */
  opacity: number;
  /** Searched substring — "$50.00" in spec, parameterized for tests. */
  needle?: string;
  /** Container the underline div is positioned inside (Stage native coords). */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Walk all text nodes under `root` and find the first occurrence of
 * `needle`. Returns the Range whose .getBoundingClientRect() yields
 * the underline coords. Returns null if not found.
 */
function findNeedleRange(root: HTMLElement | null, needle: string): Range | null {
  if (!root || !needle) return null;
  // TreeWalker scoped to text nodes only — cheap.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (
    let node = walker.nextNode() as Text | null;
    node !== null;
    node = walker.nextNode() as Text | null
  ) {
    const text = node.nodeValue ?? "";
    const idx = text.indexOf(needle);
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + needle.length);
    return range;
  }
  return null;
}

export const MoneyUnderlineOverlay: React.FC<Props> = ({
  opacity,
  needle = "$50.00",
  containerRef,
}) => {
  const [rect, setRect] = useState<Rect | null>(null);
  // The dependency is `opacity > 0` (only search while visible) plus
  // a tick from useEffect's render cycle. We bind to the container
  // ref's current DOM each frame because the DraftPane body text
  // grows char-by-char in Shot 8.
  const tickRef = useRef(0);
  tickRef.current += 1;

  // biome-ignore lint/correctness/useExhaustiveDependencies: tickRef.current is an intentional per-render trigger — the DraftPane text grows char-by-char in Shot 8, so the underline rect must be re-measured every frame, not only when opacity/needle/containerRef change.
  useEffect(() => {
    if (opacity <= 0.001) {
      setRect(null);
      return;
    }
    const containerEl = containerRef.current;
    if (!containerEl) return;
    // Look inside the rendered shell DOM under the container. The
    // EmailDraft renders body in a div with
    // class "whitespace-pre-wrap text-neutral-700 text-sm leading-relaxed".
    // We grep for any descendant with that primary class.
    const candidates = containerEl.querySelectorAll<HTMLElement>(".whitespace-pre-wrap");
    let foundRange: Range | null = null;
    for (const el of Array.from(candidates)) {
      const r = findNeedleRange(el, needle);
      if (r) {
        foundRange = r;
        break;
      }
    }
    if (!foundRange) {
      setRect(null);
      return;
    }
    const r = foundRange.getBoundingClientRect();
    const c = containerEl.getBoundingClientRect();
    setRect({
      left: r.left - c.left,
      top: r.top - c.top,
      width: r.width,
      height: r.height,
    });
  }, [opacity, needle, containerRef, tickRef.current]);

  if (opacity <= 0.001) return null;
  if (!rect) {
    // Range lookup failed (DraftPane DOM not yet rendered or
    // text node missing). Fall back to a fixed-coord amber stamp
    // positioned in the spec's expected area of the Draft pane.
    return <StampFallback opacity={opacity} />;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top + rect.height - 1,
        width: rect.width,
        height: 2,
        background: COLOR.AMBER,
        opacity,
        pointerEvents: "none",
        willChange: "opacity",
      }}
    />
  );
};

/**
 * Fallback when the DOM Range query misses. A short amber strip
 * positioned where "$50.00" lands at the spec's body height. This
 * is the "tint substring amber" alternative from SHOT_SPEC Shot 8
 * Notes, rendered as a small stamp rather than a per-glyph tint.
 */
const StampFallback: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 86,
      top: 360,
      width: 78,
      height: 2,
      background: COLOR.AMBER,
      opacity,
      pointerEvents: "none",
    }}
  />
);
