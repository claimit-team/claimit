// Stub for `@/lib/api/claims`. Only the symbols imported by the claim
// panes are stubbed. Fetches resolve quickly to placeholder values so
// effects settle before the still frame is captured.

export class ClaimsApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ClaimsApiError";
  }
}

// Wire-doc shapes — read only by `import type` consumers; an empty
// interface alias is fine.
export type ClaimDetailDoc = Record<string, unknown>;
export type ClaimDetailResponse = { claim: ClaimDetailDoc };
export type PolicyDoc = Record<string, unknown>;
export type ClaimPurchaseDoc = Record<string, unknown>;
export type DraftVersionDoc = Record<string, unknown>;
export type ListClaimsParams = Record<string, unknown>;
export type ListClaimsResponse = { claims: unknown[]; nextCursor?: string };
export type ClaimListItem = Record<string, unknown>;
export type StatusGroup = "pending" | "in_progress" | "resolved";
export type ApproveClaimBody = Record<string, unknown>;
export type ApproveClaimResponse = { ok: true };
export type RecordClaimOutcomeResponse = { ok: true };

/**
 * Evidence price-block SVG — REDESIGN-2 (v3 review).
 *
 * Styled like a real PDP price module (the kind a retailer renders
 * under a product title). Stays in the navy/neutral palette of the
 * film. Per user color-discipline rule, the price-difference chip
 * uses AMBER (not green) — only the Shot 12 and Shot 16 hero beats
 * may carry hero green.
 *
 * Layout (800 × 600 viewBox):
 *   • Top-left:  wordmark "Best Buy" in deep navy.
 *   • Center-left title block: product name + tagline.
 *   • Right side: thin-stroke headphone line-art, neutral gray.
 *   • Below title: struck $399.99 → bold $349.99 → AMBER "−$50.00" chip.
 *   • Footer thin caption: capture time + monitor agent.
 */
function bestBuySonyEvidenceSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <!-- Outer panel -->
  <rect width="800" height="600" fill="#F9FAFB"/>
  <rect x="32" y="32" width="736" height="536" rx="14" fill="#FFFFFF" stroke="#E2E6EB"/>

  <!-- Brand wordmark (top-left) -->
  <text x="64" y="92" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="16" fill="#003B73" letter-spacing="0.4">Best Buy</text>

  <!-- Title block -->
  <text x="64" y="178" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="28" fill="#101318">Sony WH-1000XM5</text>
  <text x="64" y="210" font-family="Helvetica, Arial, sans-serif" font-weight="400" font-size="16" fill="#374151">Wireless Noise-Cancelling Headphones</text>

  <!-- Headphone line-art placeholder (right side). Thin-stroke only,
       neutral gray, no fill — a clean product silhouette without
       trying to imitate a real product photo. -->
  <g transform="translate(540, 130)" stroke="#D1D5DB" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 24 96 C 24 36, 168 36, 168 96"/>
    <ellipse cx="22" cy="138" rx="32" ry="44"/>
    <ellipse cx="170" cy="138" rx="32" ry="44"/>
    <ellipse cx="22" cy="138" rx="20" ry="30" stroke="#E5E7EB"/>
    <ellipse cx="170" cy="138" rx="20" ry="30" stroke="#E5E7EB"/>
  </g>

  <!-- Price block: struck old + bold current -->
  <text x="64" y="304" font-family="Helvetica, Arial, sans-serif" font-weight="400" font-size="18" fill="#9CA3AF" text-decoration="line-through">$399.99</text>
  <text x="64" y="368" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="40" fill="#101318">$349.99</text>

  <!-- Diff chip (AMBER per color-discipline rule) -->
  <rect x="64" y="392" width="118" height="32" rx="6" fill="#FFFBEB"/>
  <text x="123" y="413" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="14" fill="#F59E0B" text-anchor="middle">−$50.00</text>

  <!-- Footer caption -->
  <line x1="64" y1="494" x2="736" y2="494" stroke="#E5E7EB" stroke-width="1"/>
  <text x="64" y="524" font-family="Helvetica, Arial, sans-serif" font-weight="400" font-size="11" fill="#6B7280">Captured 2026-05-29 11:34 UTC · ClaimIt monitor-agent</text>
</svg>`;
}

let evidenceBlobPromise: Promise<{ blob: Blob; contentType: string }> | null = null;

function loadEvidenceBlob(): Promise<{ blob: Blob; contentType: string }> {
  if (evidenceBlobPromise) return evidenceBlobPromise;
  evidenceBlobPromise = Promise.resolve({
    blob: new Blob([bestBuySonyEvidenceSvg()], { type: "image/svg+xml" }),
    contentType: "image/svg+xml",
  });
  return evidenceBlobPromise;
}

export async function fetchEvidenceBlob(
  _claimId: string,
): Promise<{ blob: Blob; contentType: string } | null> {
  return loadEvidenceBlob();
}
export async function listClaims(): Promise<ListClaimsResponse> {
  return { claims: [] };
}
export async function getClaimDetail(): Promise<ClaimDetailResponse> {
  return { claim: {} };
}
export async function approveClaim(): Promise<ApproveClaimResponse> {
  return { ok: true };
}
export async function cancelClaim(): Promise<{ ok: true }> {
  return { ok: true };
}
export async function editClaimDraft(): Promise<{ ok: true }> {
  return { ok: true };
}
export async function recordClaimOutcome(): Promise<RecordClaimOutcomeResponse> {
  return { ok: true };
}
export async function regenerateDraft(): Promise<{ ok: true }> {
  return { ok: true };
}
