"use client";

/**
 * Post-approve banner (5.7 WI-6).
 *
 * Renders above the panes in `ClaimDetailShell` when
 * `claim.status === "submitted"` (i.e. `claim.outcome === "pending"`).
 * The header's `submitted` branch renders no actions, so this banner
 * is where the user sees the "what's next" type-aware affordance
 * after approving.
 *
 * No `claim.approved` Pub/Sub consumer exists yet — the banner is
 * honest about which step ran (UI state-flip), not a confirmation of
 * merchant delivery.
 */

import { ExternalLink, Mail } from "lucide-react";

import { parseSelfServiceWalkthrough } from "@/components/claims/draft-parsers";
import { Button } from "@/components/ui/button";
import type { ClaimDetail } from "@/lib/claim-detail-types";

interface PostApproveBannerProps {
  claim: ClaimDetail;
}

/**
 * Guard wire-derived URLs before they're rendered into anchor `href`s.
 * The detail wire surface accepts any string for `policy.claim_url`
 * and `SelfServiceWalkthrough.claim_url`; we only want to render
 * external links that resolve to a real `http(s)://` URL — anything
 * else (malformed, `javascript:`, relative without origin, …) gets
 * suppressed so we never inject unsafe schemes into clickable links
 * (CodeRabbit MAJOR finding, PR #168).
 */
function toSafeExternalHref(value: string | null | undefined): string | null {
  if (!value || value === "") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function PostApproveBanner({ claim }: PostApproveBannerProps) {
  if (claim.status !== "submitted") return null;

  const policy = claim.policy;
  const latest = claim.draft_versions[claim.current_version - 1];
  const latestContent = latest?.content ?? "";

  switch (claim.claim_type) {
    case "email":
      return (
        <BannerShell variant="info">
          <Mail className="h-4 w-4" />
          <span>
            <strong className="font-medium">Submitted</strong>
            {" — sending from your Gmail."}
          </span>
        </BannerShell>
      );
    case "chat_script": {
      const chatUrl = toSafeExternalHref(policy?.claim_url);
      return (
        <BannerShell variant="info">
          <span>
            <strong className="font-medium">Approved.</strong> Use the per-step Copy buttons on the
            script to paste one message at a time.
          </span>
          {chatUrl !== null ? (
            <Button
              size="sm"
              variant="outline"
              render={
                <a href={chatUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Open {claim.platform} chat
                </a>
              }
            />
          ) : null}
        </BannerShell>
      );
    }
    case "in_store_guide":
      return (
        <BannerShell variant="info">
          <span>
            <strong className="font-medium">Approved.</strong> Show this guide at the store
            {policy?.claim_phone && policy.claim_phone !== ""
              ? ` — call ${policy.claim_phone} first if you want to confirm.`
              : "."}
          </span>
        </BannerShell>
      );
    case "self_service_walkthrough": {
      // Re-parse the latest content (cheap; the renderer also parses
      // it for the pane). Pull the platform display + claim_url + ETA
      // for a single banner row.
      const parsed = parseSelfServiceWalkthrough(latestContent);
      if (parsed === null) {
        return (
          <BannerShell variant="info">
            <span>
              <strong className="font-medium">Approved.</strong> Follow the walkthrough steps to
              complete the request yourself.
            </span>
          </BannerShell>
        );
      }
      const selfServiceUrl = toSafeExternalHref(parsed.claim_url);
      return (
        <BannerShell variant="info">
          <span>
            <strong className="font-medium">Approved.</strong> ~{parsed.estimated_minutes} min to
            complete at {parsed.platform_display_name}.
          </span>
          {selfServiceUrl !== null ? (
            <Button
              size="sm"
              variant="outline"
              render={
                <a href={selfServiceUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Open {parsed.platform_display_name}
                </a>
              }
            />
          ) : null}
        </BannerShell>
      );
    }
    default:
      return (
        <BannerShell variant="info">
          <span>
            <strong className="font-medium">Submitted.</strong>
          </span>
        </BannerShell>
      );
  }
}

function BannerShell({
  variant: _variant,
  children,
}: {
  variant: "info";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-neutral-200 border-b bg-brand-primary-50 px-4 py-2 text-brand-primary-500 text-sm lg:px-6">
      {children}
    </div>
  );
}
