"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Laptop,
  Loader2,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react";
import { type ElementType, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
import type { ClaimDetail, ClaimDetailDraftType, DraftVersion } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface DraftPaneProps {
  claim: ClaimDetail;
  refetch: () => Promise<void>;
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
  onDoubleClickHeader?: () => void;
}

type DraftMode = "preview" | "edit";

/**
 * Self-service walkthrough wire shape — the `draft_content` for
 * `claim_type === "self_service"` is `SelfServiceWalkthrough.model_dump_json()`
 * per `apps/claim-agent/src/draft/type_d_self_service.py` L297. WI-3
 * uses this shape for pre-save validation (no rich-form editor in 5.7
 * — the buffer is JSON-as-string); WI-5 reuses it for the preview
 * renderer.
 */
const SELF_SERVICE_REQUIRED_FIELDS = [
  "platform_display_name",
  "order_summary",
  "steps",
  "notes",
  "sub_pattern",
  "estimated_minutes",
  "claim_url",
  "credit_type",
] as const;

function isValidSelfServiceJson(buffer: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  return SELF_SERVICE_REQUIRED_FIELDS.every((field) => field in obj);
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
// Preview renderers (preview-only after WI-3; WI-5 will replace these with
// parsers pinned to apps/claim-agent/src/draft/*.py output formats)
// ---------------------------------------------------------------------------

function EmailDraft({ content }: { content: string }) {
  const subject = "Price adjustment request";

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-neutral-500">Subject:</span>
          <span className="text-neutral-900">{subject}</span>
        </div>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4">
        <div className="whitespace-pre-wrap text-neutral-700 text-sm">{content}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => toast.info("Gmail send · mock")}
        >
          <Send className="mr-2 h-4 w-4" />
          Send from your Gmail
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => toast.success("Copied to clipboard")}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => toast.info("Open in Gmail · mock")}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open in Gmail web
        </Button>
      </div>
    </div>
  );
}

function ChatScriptDraft({ content }: { content: string }) {
  const segments = content.split(/\n\n/).filter(Boolean);

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-3">
        {segments.map((segment) => {
          const headerMatch = segment.match(/^\[([^\]]+)\]/);
          const headerTitle = headerMatch?.[1] ?? "";
          const body = headerMatch ? segment.slice(headerMatch[0].length).trim() : segment;

          return (
            <div
              key={`${segment.slice(0, 32)}`}
              className="group relative rounded-lg border border-neutral-200 bg-neutral-0 p-4"
            >
              {headerTitle ? (
                <div className="mb-2 font-medium text-neutral-500 text-xs uppercase tracking-wide">
                  {headerTitle}
                </div>
              ) : null}
              <div className="whitespace-pre-wrap text-neutral-700 text-sm">{body}</div>
              <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                <CopyIconButton text={body} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => toast.success("Copied all")}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => toast.info("Open chat · mock")}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open retailer chat
        </Button>
      </div>
    </div>
  );
}

function GenericDraft({ content }: { content: string }) {
  return (
    <div className="p-4">
      <div className="whitespace-pre-wrap text-neutral-700 text-sm">{content}</div>
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
  onDoubleClickHeader,
}: DraftPaneProps) {
  const [selectedVersion, setSelectedVersion] = useState(claim.current_version);
  const baseline = claim.draft_versions[selectedVersion - 1]?.content ?? "";

  const [editBuffer, setEditBuffer] = useState(baseline);
  const [draftMode, setDraftMode] = useState<DraftMode>("preview");
  const [isSaving, setIsSaving] = useState(false);

  // Pending-navigation state for the unsaved-changes guard. Each entry
  // captures the navigation the user wanted but is blocked on
  // confirmation. Resolved by either Discard-and-go (apply the pending
  // change + clear) or Keep-editing (just clear).
  const [pendingTab, setPendingTab] = useState<DraftMode | null>(null);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);

  // Snap the latest version + reset buffer whenever the wire claim
  // refreshes (e.g. after a successful Save the new version lands at
  // draft_versions[length - 1]).
  useEffect(() => {
    setSelectedVersion(claim.current_version);
  }, [claim.current_version]);

  // Reset edit buffer when the selected version changes (drives both
  // initial mount and post-save snap-to-latest). Intentionally re-runs
  // when `claim` identity changes so a fresh refetch resets the buffer.
  useEffect(() => {
    setEditBuffer(claim.draft_versions[selectedVersion - 1]?.content ?? "");
  }, [selectedVersion, claim]);

  const dirty = useMemo(() => editBuffer !== baseline, [editBuffer, baseline]);
  const totalVersions = claim.draft_versions.length;
  const onLatestVersion = selectedVersion === totalVersions;
  // When the user browses an older version, force preview-only — editing
  // an older version is not a supported rollback flow in 5.7.
  useEffect(() => {
    if (!onLatestVersion && draftMode === "edit") {
      setDraftMode("preview");
    }
  }, [onLatestVersion, draftMode]);

  const Icon = claimTypeIcons[claim.claim_type];

  const renderPreview = () => {
    switch (claim.claim_type) {
      case "email":
        return <EmailDraft content={editBuffer} />;
      case "chat_script":
        return <ChatScriptDraft content={editBuffer} />;
      default:
        return <GenericDraft content={editBuffer} />;
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
    if (pendingTab !== null) setDraftMode(pendingTab);
    if (pendingVersion !== null) setSelectedVersion(pendingVersion);
    // The setSelectedVersion useEffect resets editBuffer for us; force a
    // baseline reset for the tab-only case (no version change).
    if (pendingVersion === null) {
      setEditBuffer(baseline);
    }
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
      await editClaimDraft(claim.claim_id, { draft_content: editBuffer });
      // Optimistic patch: extend draft_versions with a v(n+1) row so the
      // preview snaps to the just-saved content immediately. The refetch
      // below replaces this with server truth (single source of truth)
      // but the in-flight UI never flashes the old content.
      applyOptimistic({
        draft_content: editBuffer,
        draft_versions: [
          ...claim.draft_versions.map((dv) => ({
            version: dv.version,
            content: dv.content,
            // The wire shape uses `at`; the VM consumes `created_at`.
            // Round-trip via refetch will normalize; placeholder here.
            generated_by: null,
            at: dv.created_at,
          })),
          {
            version: claim.draft_versions.length + 1,
            content: editBuffer,
            generated_by: "user_edit",
            at: nowIso,
          },
        ],
      });
      await refetch();
      toast.success("Draft updated");
      setDraftMode("preview");
      // setSelectedVersion will fire via the useEffect when the refreshed
      // current_version lands; no explicit set needed here.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save draft";
      toast.error(message);
      // Reconcile back to server truth so the optimistic patch (which
      // didn't include a server-assigned id / final timestamps) doesn't
      // linger. WI-11 polishes the re-enable UX.
      await refetch().catch(() => {
        /* ignore — surfaced via the toast above */
      });
    } finally {
      setIsSaving(false);
    }
  };

  const editHint = EDIT_TEXTAREA_HINT_BY_TYPE[claim.claim_type];

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader
        title={claimTypeLabels[claim.claim_type]}
        icon={Icon}
        onDoubleClick={onDoubleClickHeader}
      />

      <div className="flex items-center justify-between border-neutral-200 border-b px-4 py-2">
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
        <div className="border-neutral-200 border-b px-4">
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
