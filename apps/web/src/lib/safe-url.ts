/**
 * URL allow-list helpers for rendering wire-derived values into anchor
 * `href`s. Wire-side fields (`policy.claim_url`,
 * `SelfServiceWalkthrough.claim_url`, …) come from upstream sources we
 * don't fully control — backend pulls, AI generators, user edits in the
 * draft buffer — so they can carry malformed or hostile schemes
 * (`javascript:`, relative-without-origin, …). Pipe them through
 * `toSafeExternalHref` before binding so the UI never injects
 * non-`http(s)` schemes into clickable links.
 *
 * Centralized here (originally inlined in
 * `components/claims/post-approve-banner.tsx`) so the draft-pane
 * renderers can share the same guard — flagged by both CodeRabbit
 * MAJOR and Bugbot MEDIUM on PR #168.
 */

/**
 * Return `value` unchanged iff it parses as a `http://` or `https://`
 * URL; otherwise return `null`. Callers should conditionally render
 * the anchor only when this returns a non-null string.
 */
export function toSafeExternalHref(value: string | null | undefined): string | null {
  if (!value || value === "") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
