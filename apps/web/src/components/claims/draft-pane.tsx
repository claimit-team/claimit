"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Laptop,
  Loader2,
  Mail,
  MessageSquare,
} from "lucide-react";
import { type ElementType, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ClaimDetailDoc, editClaimDraft } from "@/lib/api/claims";
import type {
  ClaimDetail,
  ClaimDetailDraftType,
  ClaimPolicy,
  DraftVersion,
} from "@/lib/claim-detail-types";
import { toSafeExternalHref } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

import {
  deriveEmailSubject,
  isValidSelfServiceJson,
  parseChatScript,
  parseInStoreGuide,
  parseOrderSummary,
  parseSelfServiceWalkthrough,
} from "./draft-parsers";

const FALLBACK_POLICY: ClaimPolicy = {
  claim_email: "",
  claim_url: "",
  claim_phone: "",
  window_days: 0,
};

export type DraftMode = "preview" | "edit";

interface DraftPaneProps {
  claim: ClaimDetail;
  refetch: () => Promise<void>;
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
  /**
   * Controlled draft-mode tab. Lifted to `ClaimDetailShell` in WI-8 so
   * the header's "Edit draft" button can flip the tab from outside.
   * Local guard state (pending tab/version dialog) stays in DraftPane
   * because it represents a user-initiated transition (not external).
   */
  draftMode: DraftMode;
  setDraftMode: (mode: DraftMode) => void;
  selectedVersion: number;
  setSelectedVersion: (version: number) => void;
  editBuffer: string;
  setEditBuffer: (content: string) => void;
  /** True when `editBuffer !== draft_versions[selectedVersion - 1].content`. */
  dirty: boolean;
  /** Semi-opaque overlay while assistant redraft is in flight. */
  isRegenerating?: boolean;
  /** 45s timeout elapsed without a new draft version. */
  regeneratingTimedOut?: boolean;
  onDoubleClickHeader?: () => void;
}

function PaneHeader({
  title,
  icon: Icon,
  onDoubleClick,
}: {
  title: string;
  icon: ElementType;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full cursor-default items-center gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3 text-left"
      onDoubleClick={onDoubleClick}
    >
      <Icon className="h-4 w-4 text-neutral-500" />
      <h3 className="font-medium text-neutral-900 text-sm">{title}</h3>
    </button>
  );
}

/**
 * Map backend `DraftGeneratedBy` (read-tolerant string | null) to a
 * UI label. Unknown values render Title-Case via the fallback so a
 * legacy/future enum value doesn't crash the dropdown.
 */
function sourceLabel(generatedBy: string | null | undefined): string {
  if (generatedBy === null || generatedBy === undefined) return "Source unknown";
  switch (generatedBy) {
    case "agent":
      return "AI draft";
    case "user_edit":
      return "You edited";
    case "assistant_redraft":
      return "Assistant rewrite";
    default:
      return generatedBy
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function formatVersionTimestamp(iso: string): string {
  if (iso === "") return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  try {
    return formatDistanceToNow(new Date(ms), { addSuffix: true });
  } catch {
    return "";
  }
}

function VersionDropdown({
  versions,
  selectedVersion,
  onVersionChange,
}: {
  versions: DraftVersion[];
  selectedVersion: number;
  onVersionChange: (version: number) => void;
}) {
  const totalVersions = versions.length;
  // Empty-versions edge: render neutral, non-interactive copy so the
  // header doesn't imply a real version exists (the empty-draft
  // Alert in `renderPreview` already handles the user-facing
  // message; CodeRabbit MINOR, PR #168).
  if (totalVersions === 0) {
    return (
      <span className="inline-flex h-8 items-center px-2 font-medium text-neutral-500 text-sm">
        No versions yet
      </span>
    );
  }
  const selected = versions[selectedVersion - 1];
  const selectedSource = selected ? sourceLabel(selected.generated_by) : "";
  const selectedWhen = selected ? formatVersionTimestamp(selected.created_at) : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium text-neutral-700 text-sm outline-none hover:bg-muted",
        )}
      >
        <span>
          v{selectedVersion}
          {totalVersions > 1 ? ` of ${totalVersions}` : ""}
          {selectedSource ? ` · ${selectedSource}` : ""}
          {selectedWhen ? ` · ${selectedWhen}` : ""}
        </span>
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {versions.map((dv) => {
          const when = formatVersionTimestamp(dv.created_at);
          return (
            <DropdownMenuItem key={dv.version} onClick={() => onVersionChange(dv.version)}>
              <div className="flex flex-col">
                <span className="font-medium">
                  v{dv.version} · {sourceLabel(dv.generated_by)}
                </span>
                {when ? <span className="text-neutral-500 text-xs">{when}</span> : null}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={handleCopy}>
      {copied ? <Check className="h-4 w-4 text-semantic-success" /> : <Copy className="h-4 w-4" />}
      <span className="sr-only">Copy</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Preview renderers (parsers pinned to apps/claim-agent/src/draft/*.py
// output formats — see draft-parsers.ts). Each renderer falls back to
// `<pre>` on parse mismatch so a generator-format drift never crashes
// the UI nor silently drops content.
// ---------------------------------------------------------------------------

function FallbackPre({ content }: { content: string }) {
  return (
    <div className="p-4">
      <div className="mb-2 flex items-start gap-2 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 p-3 text-semantic-warning text-xs">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The draft doesn&apos;t match the expected format for this claim type — showing the raw
          content below.
        </span>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-0 p-4 text-neutral-700 text-sm">
        {content}
      </pre>
    </div>
  );
}

function EmailDraft({
  content,
  policy,
  orderId,
}: {
  content: string;
  policy: ClaimPolicy;
  orderId: string;
}) {
  // type_a_email.py L138, L146: draft_content is body-only — Claim has
  // no `subject` field. Derive a display-only subject from the order
  // id so the To/Subject rows stay informative. Edit buffer
  // intentionally excludes this string (WI-3).
  const subject = deriveEmailSubject(orderId);
  const toAddress = policy.claim_email;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
        {toAddress !== "" ? (
          <div className="flex items-center gap-2">
            <span className="w-16 font-medium text-neutral-500">To:</span>
            <span className="text-neutral-900">{toAddress}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="w-16 font-medium text-neutral-500">Subject:</span>
          <span className="text-neutral-900">{subject}</span>
        </div>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4">
        {/*
          Hero render: body uses normal prose font + whitespace-pre-wrap
          (NOT <pre>). Monospace would read like code next to the To/
          Subject rows. <pre> is reserved for FallbackPre only.
        */}
        <div className="whitespace-pre-wrap text-neutral-700 text-sm leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
}

function ChatScriptDraft({ content }: { content: string }) {
  const parsed = parseChatScript(content);
  const [showEscalation, setShowEscalation] = useState(false);

  if (parsed === null) {
    return <FallbackPre content={content} />;
  }

  return (
    <div className="space-y-4 p-4">
      {parsed.title !== "" ? (
        <h4 className="font-medium text-neutral-900 text-sm">{parsed.title}</h4>
      ) : null}
      <ol className="space-y-2">
        {parsed.mainSteps.map((step, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: composite `${idx}-${slice}` key — fixes duplicate-content collision per CodeRabbit minor.
          <ChatStepRow key={`main-${idx}-${step.slice(0, 24)}`} index={idx + 1} text={step} />
        ))}
      </ol>
      {parsed.escalationSteps.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowEscalation((v) => !v)}
            className="inline-flex items-center gap-1 text-neutral-500 text-xs hover:text-neutral-700"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", showEscalation ? "rotate-90" : "")}
            />
            If the agent declines or stalls
          </button>
          {showEscalation ? (
            <ol className="space-y-2">
              {parsed.escalationSteps.map((step, idx) => {
                // Composite key `${idx}-${slice}` fixes duplicate-content
                // collisions (CodeRabbit minor). List isn't reordered.
                const escalationKey = `escalation-${idx}-${step.slice(0, 24)}`;
                return (
                  <ChatStepRow
                    key={escalationKey}
                    index={parsed.mainSteps.length + idx + 1}
                    text={step}
                  />
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChatStepRow({ index, text }: { index: number; text: string }) {
  return (
    <li className="group relative rounded-lg border border-neutral-200 bg-neutral-0 p-3 pr-12">
      <div className="mb-1 font-medium text-neutral-500 text-xs">Step {index}</div>
      <div className="whitespace-pre-wrap text-neutral-700 text-sm">{text}</div>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyIconButton text={text} />
      </div>
    </li>
  );
}

function InStoreGuide({ content, policy }: { content: string; policy: ClaimPolicy }) {
  const parsed = parseInStoreGuide(content);
  if (parsed === null) {
    return <FallbackPre content={content} />;
  }
  // Policy URLs come from a backend pull; guard the scheme before
  // binding to anchor `href` so a backend regression (or hostile
  // upstream) can never inject a non-http(s) scheme into a clickable
  // link (CodeRabbit MAJOR / Bugbot MEDIUM, PR #168).
  const policyUrl = toSafeExternalHref(policy.claim_url);

  // `data-print-target`: the print stylesheet (ticket 5.16 — see
  // app/globals.css `@media print { body.printing-in-store-guide ... }`)
  // isolates this subtree so window.print() renders only the guide,
  // not the surrounding 3-pane chrome.
  return (
    <div className="space-y-3 p-4" data-print-target>
      <h4 className="font-medium text-neutral-900 text-sm">{parsed.title}</h4>
      {parsed.sections.map((section, sIdx) => {
        // Composite key `${sIdx}-${section.key}` disambiguates any
        // >5-section parser-drift cases (CodeRabbit minor). List isn't
        // reordered, generator emits a fixed 5-section sequence.
        const sectionKey = `${sIdx}-${section.key}`;
        return (
          <div
            key={sectionKey}
            className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-0 p-4"
          >
            <div className="font-medium text-neutral-900 text-sm">{section.heading}</div>
            {section.paragraphs.length > 0 ? (
              <div className="space-y-1 text-neutral-700 text-sm">
                {section.paragraphs.map((p, pIdx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: composite `${sIdx}-${pIdx}-${slice}` key — fixes duplicate-content collision per CodeRabbit minor.
                  <p key={`p-${sIdx}-${pIdx}-${p.slice(0, 24)}`} className="whitespace-pre-wrap">
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
            {section.bullets.length > 0 ? (
              <ul className="ml-4 list-disc space-y-1 text-neutral-700 text-sm">
                {section.bullets.map((b, bIdx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: composite `${sIdx}-${bIdx}-${slice}` key — fixes duplicate-content collision per CodeRabbit minor.
                  <li key={`b-${sIdx}-${bIdx}-${b.slice(0, 24)}`}>{b}</li>
                ))}
              </ul>
            ) : null}
            {section.numbered.length > 0 ? (
              <ol className="ml-4 list-decimal space-y-1 text-neutral-700 text-sm">
                {section.numbered.map((n, nIdx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: composite `${sIdx}-${nIdx}-${slice}` key — fixes duplicate-content collision per CodeRabbit minor.
                  <li key={`n-${sIdx}-${nIdx}-${n.slice(0, 24)}`}>{n}</li>
                ))}
              </ol>
            ) : null}
          </div>
        );
      })}
      {policy.claim_phone !== "" || policyUrl !== null ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-neutral-600 text-xs">
          {policy.claim_phone !== "" ? (
            <div>
              Call ahead: <span className="font-medium text-neutral-800">{policy.claim_phone}</span>
            </div>
          ) : null}
          {policyUrl !== null ? (
            <div className="mt-1 truncate">
              Policy:{" "}
              <a
                href={policyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-primary-500 underline-offset-2 hover:underline"
              >
                {policyUrl}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SelfServiceWalkthrough({ content }: { content: string }) {
  const parsed = parseSelfServiceWalkthrough(content);
  if (parsed === null) {
    return <FallbackPre content={content} />;
  }
  const summary = parseOrderSummary(parsed.order_summary);
  // `parsed.claim_url` comes from user-editable draft JSON, so a
  // hand-edit could land a non-http scheme (`javascript:`, …) in the
  // anchor. Guard via the shared allow-list helper before rendering
  // — same pattern post-approve-banner uses for policy URLs
  // (CodeRabbit MAJOR / Bugbot MEDIUM, PR #168).
  const selfServiceUrl = toSafeExternalHref(parsed.claim_url);

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-medium text-neutral-900 text-sm">{parsed.platform_display_name}</h4>
          {parsed.estimated_minutes > 0 ? (
            <Badge variant="outline" className="text-neutral-700 text-xs">
              ~{parsed.estimated_minutes} min
            </Badge>
          ) : null}
        </div>
        {summary !== null ? (
          <div className="space-y-2">
            <div className="text-neutral-700 text-sm">{summary.product}</div>
            <div className="flex flex-wrap gap-2">
              <PriceCallout label="Paid" value={summary.paid} currency={summary.currency} muted />
              <PriceCallout label="Now" value={summary.now} currency={summary.currency} muted />
              <PriceCallout
                label="Save"
                value={summary.save}
                currency={summary.currency}
                highlight
              />
            </div>
          </div>
        ) : (
          <div className="text-neutral-700 text-sm">{parsed.order_summary}</div>
        )}
      </div>

      {parsed.sub_pattern === "cancel_rebook" ? (
        <div className="flex items-start gap-2 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 p-3 text-semantic-warning text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This process requires cancelling and rebooking the same itinerary. Your original seat
            selection may be lost.
          </span>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-0 p-4">
        <div className="font-medium text-neutral-900 text-sm">Steps</div>
        <ol className="ml-4 list-decimal space-y-2 text-neutral-700 text-sm">
          {parsed.steps.map((step, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: composite `${idx}-${slice}` key — fixes duplicate-content collision per CodeRabbit minor.
            <li key={`step-${idx}-${step.slice(0, 24)}`} className="whitespace-pre-wrap">
              {step}
            </li>
          ))}
        </ol>
      </div>

      {parsed.notes.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="font-medium text-neutral-900 text-sm">Notes</div>
          <ul className="ml-4 list-disc space-y-1 text-neutral-700 text-sm">
            {parsed.notes.map((note, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: composite `${idx}-${slice}` key — fixes duplicate-content collision per CodeRabbit minor.
              <li key={`note-${idx}-${note.slice(0, 24)}`} className="whitespace-pre-wrap">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {selfServiceUrl !== null ? (
          <Button
            size="sm"
            render={
              <a href={selfServiceUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open {parsed.platform_display_name}
              </a>
            }
          />
        ) : null}
        <span className="text-neutral-500 text-xs">Refund issued as {parsed.credit_type}</span>
      </div>
    </div>
  );
}

function PriceCallout({
  label,
  value,
  currency,
  muted = false,
  highlight = false,
}: {
  label: string;
  value: string;
  currency: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border px-3 py-2 text-xs",
        highlight
          ? "border-semantic-success/30 bg-semantic-success/5 text-semantic-success"
          : muted
            ? "border-neutral-200 bg-neutral-50 text-neutral-700"
            : "border-neutral-200 bg-neutral-0 text-neutral-700",
      )}
    >
      <span
        className={cn("font-medium uppercase tracking-wide", highlight ? "" : "text-neutral-500")}
      >
        {label}
      </span>
      <span className="font-medium text-sm">
        {value} {currency}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pane
// ---------------------------------------------------------------------------

const claimTypeIcons: Record<ClaimDetailDraftType, ElementType> = {
  email: Mail,
  chat_script: MessageSquare,
  in_store_guide: MessageSquare,
  self_service_walkthrough: Laptop,
};

const claimTypeLabels: Record<ClaimDetailDraftType, string> = {
  email: "Email Draft",
  chat_script: "Chat Script",
  in_store_guide: "In-Store Guide",
  self_service_walkthrough: "Self-Service Walkthrough",
};

const SELF_SERVICE_PLACEHOLDER_TEXTAREA_HINT =
  "Self-service drafts are stored as JSON. Validate before saving — invalid JSON cannot render.";

const EDIT_TEXTAREA_HINT_BY_TYPE: Partial<Record<ClaimDetailDraftType, string>> = {
  self_service_walkthrough: SELF_SERVICE_PLACEHOLDER_TEXTAREA_HINT,
};

export function DraftPane({
  claim,
  refetch,
  applyOptimistic,
  draftMode,
  setDraftMode,
  selectedVersion,
  setSelectedVersion,
  editBuffer,
  setEditBuffer,
  dirty,
  isRegenerating = false,
  regeneratingTimedOut = false,
  onDoubleClickHeader,
}: DraftPaneProps) {
  const baseline = claim.draft_versions[selectedVersion - 1]?.content ?? "";

  const [isSaving, setIsSaving] = useState(false);

  // Pending-navigation state for the unsaved-changes guard. Each entry
  // captures the navigation the user wanted but is blocked on
  // confirmation. Resolved by either Discard-and-go (apply the pending
  // change + clear) or Keep-editing (just clear). Stays local to
  // DraftPane — guard fires only for user-initiated transitions, not
  // shell-initiated ones (header's "Edit draft" bypasses).
  const [pendingTab, setPendingTab] = useState<DraftMode | null>(null);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);

  const totalVersions = claim.draft_versions.length;
  // Treat the no-versions edge (e.g. an upstream agent failure left the
  // claim with `draft_versions === []`) as "on latest" so the
  // "Back to latest" affordance never appears (Bugbot LOW finding, PR
  // #168). The empty-draft Alert in `renderPreview` already covers the
  // user-facing message; the header navigation stays calm.
  const onLatestVersion = totalVersions === 0 || selectedVersion === totalVersions;
  // When the user browses an older version, force preview-only — editing
  // an older version is not a supported rollback flow in 5.7.
  useEffect(() => {
    if (!onLatestVersion && draftMode === "edit") {
      setDraftMode("preview");
    }
  }, [onLatestVersion, draftMode, setDraftMode]);

  const Icon = claimTypeIcons[claim.claim_type];

  const policy = claim.policy ?? FALLBACK_POLICY;
  const renderPreview = () => {
    // editBuffer mirrors selectedVersion (reset via useEffect when
    // version changes), so preview always reflects the selected
    // version. On the latest version with active edits, the user sees
    // their in-progress changes — matches the "live preview" pattern.
    //
    // Empty-draft guard (WI-11): when the selected version has no
    // content (e.g. an upstream agent failure produced an empty
    // draft_content row) we surface a calm alert instead of letting
    // the parser fall through to an empty <pre>. The user can still
    // switch to Edit and write one by hand.
    if (editBuffer.trim() === "") {
      return (
        <div className="p-4">
          <Alert>
            <AlertCircle className="size-4" />
            <AlertTitle>No draft yet</AlertTitle>
            <AlertDescription>
              {onLatestVersion
                ? "This claim doesn't have a draft. Switch to Edit to write one."
                : "This version had no content. Switch to a newer version to view the draft."}
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    switch (claim.claim_type) {
      case "email":
        return (
          <EmailDraft content={editBuffer} policy={policy} orderId={claim.purchase.order_id} />
        );
      case "chat_script":
        return <ChatScriptDraft content={editBuffer} />;
      case "in_store_guide":
        return <InStoreGuide content={editBuffer} policy={policy} />;
      case "self_service_walkthrough":
        return <SelfServiceWalkthrough content={editBuffer} />;
      default:
        return <FallbackPre content={editBuffer} />;
    }
  };

  // Confirm dialog open when there's a pending blocked navigation.
  const guardOpen = pendingTab !== null || pendingVersion !== null;

  const clearPending = () => {
    setPendingTab(null);
    setPendingVersion(null);
  };

  const handleTabChange = (next: string) => {
    const nextMode = next === "edit" ? "edit" : "preview";
    if (nextMode === draftMode) return;
    if (dirty && draftMode === "edit") {
      setPendingTab(nextMode);
      return;
    }
    setDraftMode(nextMode);
  };

  const handleVersionChange = (version: number) => {
    if (version === selectedVersion) return;
    if (dirty) {
      setPendingVersion(version);
      return;
    }
    setSelectedVersion(version);
  };

  const applyPending = () => {
    // Discard the user's in-progress edits by resetting the buffer to
    // the pending version's content. We can't rely on the
    // `currentDraftContent`-keyed effect in the shell to do this for
    // us — if two versions happen to share identical content (rare but
    // possible when an AI regen produces the same output), the effect
    // wouldn't fire and the dirty buffer would silently carry over to
    // the new version even after the user clicked "Discard" (Bugbot
    // LOW finding, PR #168). Compute the target baseline explicitly
    // and reset unconditionally.
    const nextSelectedVersion = pendingVersion !== null ? pendingVersion : selectedVersion;
    const nextBaseline = claim.draft_versions[nextSelectedVersion - 1]?.content ?? "";
    if (pendingTab !== null) setDraftMode(pendingTab);
    if (pendingVersion !== null) setSelectedVersion(pendingVersion);
    setEditBuffer(nextBaseline);
    clearPending();
  };

  const handleDiscard = () => {
    setEditBuffer(baseline);
    setDraftMode("preview");
  };

  const handleSave = async () => {
    if (!dirty || isSaving) return;

    // Pre-save validation for self-service: the buffer is JSON-as-string
    // (apps/claim-agent/src/draft/type_d_self_service.py emits
    // SelfServiceWalkthrough.model_dump_json()). Reject malformed JSON or
    // missing fields so a hand-edit doesn't corrupt the draft into a
    // permanent <pre> fallback state.
    if (claim.claim_type === "self_service_walkthrough" && !isValidSelfServiceJson(editBuffer)) {
      toast.error("Invalid walkthrough format — fix the JSON before saving");
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const nextVersion = claim.draft_versions.length + 1;
      await editClaimDraft(claim.claim_id, { draft_content: editBuffer });
      // Edit write succeeded — apply the optimistic patch + flip back
      // to preview regardless of whether the follow-up refetch lands.
      // A refetch-only failure does NOT mean the save failed; reporting
      // it as such would mislead the user into re-typing changes that
      // already persisted (matches the approve / cancel pattern;
      // Bugbot LOW finding, PR #168).
      applyOptimistic({
        draft_content: editBuffer,
        draft_versions: [
          ...claim.draft_versions.map((dv) => ({
            version: dv.version,
            content: dv.content,
            // PRESERVE prior versions' authorship through the
            // optimistic patch — refetch replaces with server truth,
            // but erasing it for the sub-second window would briefly
            // hide the "AI draft" / "You edited" badges in the
            // version dropdown (Bugbot LOW finding, PR #168).
            // The wire shape uses `at`; the VM consumes `created_at`,
            // so round-trip via refetch normalises both.
            generated_by: dv.generated_by ?? null,
            at: dv.created_at,
          })),
          {
            version: nextVersion,
            content: editBuffer,
            generated_by: "user_edit",
            at: nowIso,
          },
        ],
      });
      // Pin selection to the newly-saved version immediately
      // (CodeRabbit MINOR, PR #168). Otherwise selectedVersion stayed
      // on the previous one until the refetch resolved; if refetch
      // failed the pane would land on a stale version that's now
      // read-only (DraftPane forces preview-only off-latest), even
      // though the save itself succeeded.
      setSelectedVersion(nextVersion);
      try {
        await refetch();
        toast.success("Draft updated");
      } catch {
        // Show ONLY the refresh-failure toast (not the success toast)
        // so the user doesn't get a confusing double-toast. The save
        // itself succeeded; the optimistic patch is in state; reload
        // syncs to server truth (CodeRabbit MINOR, PR #168).
        toast.error("Draft saved, but refresh failed. Reload to see latest state.");
      }
      setDraftMode("preview");
    } catch (err: unknown) {
      // Write itself failed — surface the real error and let the user
      // retry. No optimistic patch was applied so there's nothing to
      // reconcile.
      const message = err instanceof Error ? err.message : "Could not save draft";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const editHint = EDIT_TEXTAREA_HINT_BY_TYPE[claim.claim_type];

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      {/* PaneHeader, version-selector row, and preview/edit tabs are
          all part of the DraftPane chrome — `data-print-hide` so the
          5.16 print stylesheet collapses them and renders only the
          `[data-print-target]` InStoreGuide content full-width. */}
      <div data-print-hide>
        <PaneHeader
          title={claimTypeLabels[claim.claim_type]}
          icon={Icon}
          onDoubleClick={onDoubleClickHeader}
        />
      </div>

      <div
        className="flex items-center justify-between border-neutral-200 border-b px-4 py-2"
        data-print-hide
      >
        <VersionDropdown
          versions={claim.draft_versions}
          selectedVersion={selectedVersion}
          onVersionChange={handleVersionChange}
        />
        {!onLatestVersion ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="text-neutral-600"
            onClick={() => handleVersionChange(totalVersions)}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to latest
          </Button>
        ) : null}
      </div>

      <Tabs
        value={draftMode}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="border-neutral-200 border-b px-4" data-print-hide>
          <TabsList variant="default" className="h-10 bg-transparent">
            <TabsTrigger value="preview" className="data-active:bg-neutral-100">
              Preview
            </TabsTrigger>
            {onLatestVersion ? (
              <TabsTrigger value="edit" className="data-active:bg-neutral-100">
                Edit
              </TabsTrigger>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-disabled="true"
                  className={cn(
                    "inline-flex h-10 cursor-not-allowed items-center justify-center rounded-md px-3 font-medium text-sm opacity-50",
                  )}
                >
                  Edit
                </TooltipTrigger>
                <TooltipContent>Switch to the latest version to edit.</TooltipContent>
              </Tooltip>
            )}
          </TabsList>
        </div>

        {regeneratingTimedOut ? (
          <div className="border-neutral-200 border-b px-4 py-2">
            <Alert variant="default">
              <AlertCircle className="size-4" />
              <AlertTitle>Taking longer than expected</AlertTitle>
              <AlertDescription>Refresh to check for an updated draft.</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsContent value="preview" className="m-0 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">{renderPreview()}</ScrollArea>
          </TabsContent>

          <TabsContent value="edit" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-4">
                {editHint ? <p className="mb-2 text-neutral-500 text-xs">{editHint}</p> : null}
                <Textarea
                  value={editBuffer}
                  onChange={(e) => setEditBuffer(e.target.value)}
                  className="min-h-80 font-mono text-sm"
                  aria-label={`Edit ${claimTypeLabels[claim.claim_type]} content`}
                  disabled={isSaving}
                />
              </div>
            </ScrollArea>
            <div className="flex items-center justify-end gap-2 border-neutral-200 border-t bg-neutral-50 px-4 py-3">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={handleDiscard}
                disabled={!dirty || isSaving}
              >
                Discard
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </TabsContent>

          {isRegenerating ? (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-0/80 backdrop-blur-[1px]"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2 className="h-8 w-8 animate-spin text-neutral-600" />
              <p className="font-medium text-neutral-700 text-sm">Regenerating draft…</p>
            </div>
          ) : null}
        </div>
      </Tabs>

      <Dialog
        open={guardOpen}
        onOpenChange={(open) => {
          if (!open) clearPending();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved edits?</DialogTitle>
            <DialogDescription>
              You have unsaved changes in the draft. Continuing will discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={clearPending}>
              Keep editing
            </Button>
            <Button variant="destructive" type="button" onClick={applyPending}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
