"use client";

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Laptop,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react";
import { type ElementType, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ClaimDetailDoc } from "@/lib/api/claims";
import type { ClaimDetail, ClaimDetailDraftType } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface DraftPaneProps {
  claim: ClaimDetail;
  /**
   * Re-pull server truth. Consumed by WI-3 (edit/save) after the PUT
   * /edit completes; accepted here so the prop interface is stable
   * across the WI-2 plumbing commit.
   */
  refetch: () => Promise<void>;
  /**
   * Shallow-merge a partial wire claim. Consumed by WI-3 to push the
   * new draft version into the wire state before the network round-trip.
   */
  applyOptimistic: (patch: Partial<ClaimDetailDoc>) => void;
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

function VersionDropdown({
  currentVersion,
  totalVersions,
  onVersionChange,
}: {
  currentVersion: number;
  totalVersions: number;
  onVersionChange: (version: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium text-neutral-700 text-sm outline-none hover:bg-muted",
        )}
      >
        Version {currentVersion} of {totalVersions}
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Array.from({ length: totalVersions }, (_, i) => i + 1).map((v) => (
          <DropdownMenuItem key={v} onClick={() => onVersionChange(v)}>
            Version {v}
          </DropdownMenuItem>
        ))}
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

function EmailDraft({
  content,
  isEditing,
  onContentChange,
}: {
  content: string;
  isEditing: boolean;
  onContentChange: (content: string) => void;
}) {
  const subject = "Price adjustment request";

  const [editSubject, setEditSubject] = useState(subject);
  const [editBody, setEditBody] = useState(content);

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="body">Body</Label>
          <Textarea
            id="body"
            value={editBody}
            onChange={(e) => {
              setEditBody(e.target.value);
              onContentChange(e.target.value);
            }}
            className="min-h-64 font-mono text-sm"
          />
        </div>
      </div>
    );
  }

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

function ChatScriptDraft({
  content,
  isEditing,
  onContentChange,
}: {
  content: string;
  isEditing: boolean;
  onContentChange: (content: string) => void;
}) {
  const segments = content.split(/\n\n/).filter(Boolean);
  const [editContent, setEditContent] = useState(content);

  if (isEditing) {
    return (
      <div className="p-4">
        <Textarea
          value={editContent}
          onChange={(e) => {
            setEditContent(e.target.value);
            onContentChange(e.target.value);
          }}
          className="min-h-80 font-mono text-sm"
        />
      </div>
    );
  }

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

function GenericDraft({
  content,
  isEditing,
  onContentChange,
}: {
  content: string;
  isEditing: boolean;
  onContentChange: (content: string) => void;
}) {
  if (isEditing) {
    return (
      <div className="p-4">
        <Textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          className="min-h-80 font-mono text-sm"
        />
      </div>
    );
  }
  return (
    <div className="p-4">
      <div className="whitespace-pre-wrap text-neutral-700 text-sm">{content}</div>
    </div>
  );
}

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

export function DraftPane({
  claim,
  refetch: _refetch,
  applyOptimistic: _applyOptimistic,
  onDoubleClickHeader,
}: DraftPaneProps) {
  const [selectedVersion, setSelectedVersion] = useState(claim.current_version);
  const baseline = claim.draft_versions[selectedVersion - 1]?.content ?? "";

  const [localContent, setLocalContent] = useState(baseline);

  useEffect(() => {
    setLocalContent(claim.draft_versions[selectedVersion - 1]?.content ?? "");
  }, [selectedVersion, claim]);

  const Icon = claimTypeIcons[claim.claim_type];

  const renderDraftContent = (isEditing: boolean) => {
    const body = localContent;

    switch (claim.claim_type) {
      case "email":
        return (
          <EmailDraft content={body} isEditing={isEditing} onContentChange={setLocalContent} />
        );
      case "chat_script":
        return (
          <ChatScriptDraft content={body} isEditing={isEditing} onContentChange={setLocalContent} />
        );
      default:
        return (
          <GenericDraft content={body} isEditing={isEditing} onContentChange={setLocalContent} />
        );
    }
  };

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader
        title={claimTypeLabels[claim.claim_type]}
        icon={Icon}
        onDoubleClick={onDoubleClickHeader}
      />

      <div className="flex items-center justify-between border-neutral-200 border-b px-4 py-2">
        <VersionDropdown
          currentVersion={selectedVersion}
          totalVersions={claim.draft_versions.length}
          onVersionChange={(v) => {
            setSelectedVersion(v);
          }}
        />
      </div>

      <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-neutral-200 border-b px-4">
          <TabsList variant="default" className="h-10 bg-transparent">
            <TabsTrigger value="preview" className="data-active:bg-neutral-100">
              Preview
            </TabsTrigger>
            <TabsTrigger value="edit" className="data-active:bg-neutral-100">
              Edit
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="preview" className="m-0">
            {renderDraftContent(false)}
          </TabsContent>
          <TabsContent value="edit" className="m-0">
            {renderDraftContent(true)}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
