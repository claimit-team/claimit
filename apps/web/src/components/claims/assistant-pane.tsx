"use client";

import { AlertCircle, Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { MarkdownMessage } from "@/components/assistant/markdown-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantStream } from "@/hooks/useAssistantStream";
import { useConversations } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import { useClaimDetailRefetchStore } from "@/store/claim-detail-refetch";
import { useClaimRedraftProgressStore } from "@/store/claim-redraft-progress";
import type { UIMessage, UIToolCall, WireConversationMessage } from "@/types/assistant";

interface AssistantPaneProps {
  /** Claim id this conversation is scoped to. */
  claimId: string;
  /** Latest draft version on the claim — used to start redraft progress tracking. */
  currentVersion?: number;
  /**
   * 5.9 seam: assistant redraft will call `refetch()` here to sync
   * the draft pane after a successful assistant-driven draft mutation.
   * Accepted in 5.7 so the prop interface is stable; page registers
   * refetch via claim-detail-refetch store for SSE fanout.
   */
  refetch?: () => Promise<void>;
  onDoubleClickHeader?: () => void;
}

const QUICK_ACTIONS = [
  "Make it friendlier",
  "Why this template?",
  "Explain the policy match",
  "Switch to manual approval",
];

function wireToUI(messages: WireConversationMessage[]): UIMessage[] {
  return messages.map((m, idx) => ({
    id: `srv-${idx}-${m.at}`,
    role: m.role,
    content: m.content,
    at: m.at,
    tool_calls: m.tool_calls?.map(
      (tc): UIToolCall => ({
        tool: tc.tool,
        input: tc.input,
        output_summary: tc.output_summary,
      }),
    ),
  }));
}

function PaneHeader({ onDoubleClick }: { onDoubleClick?: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full cursor-default items-center justify-between border-neutral-200 border-b bg-neutral-0 px-4 py-3 text-left outline-none"
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-primary-500" />
        <h3 className="font-medium text-neutral-900 text-sm">Assistant</h3>
      </div>
      <Badge variant="secondary" className="bg-brand-primary-50 text-brand-primary-500 text-xs">
        🎯 Claim-focused
      </Badge>
    </button>
  );
}

function pendingToolName(message: UIMessage): string | null {
  if (!message.tool_calls?.length) return null;
  for (let i = message.tool_calls.length - 1; i >= 0; i -= 1) {
    const tc = message.tool_calls[i];
    if (tc.output_summary === undefined) return tc.tool;
  }
  return null;
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isAssistant = message.role === "assistant";
  const runningTool = isAssistant && message.streaming ? pendingToolName(message) : null;

  return (
    <div className={cn("flex gap-3", isAssistant ? "justify-start" : "justify-end")}>
      {isAssistant ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
          <Bot className="h-4 w-4 text-neutral-600" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 md:max-w-[70%]",
          isAssistant ? "bg-neutral-100 text-neutral-900" : "bg-brand-primary-500 text-white",
        )}
      >
        {isAssistant ? (
          <>
            <MarkdownMessage text={message.content} animate={message.streaming} />
            {message.streaming && !runningTool ? (
              <Loader2
                aria-hidden
                className="ml-1 inline-block h-3 w-3 animate-spin text-neutral-500 align-middle"
              />
            ) : null}
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        )}
        {runningTool ? (
          <Badge variant="secondary" className="mt-2 text-neutral-500 text-xs">
            Running {runningTool}…
          </Badge>
        ) : null}
        {!runningTool && message.tool_calls && message.tool_calls.length > 0 ? (
          <Badge variant="secondary" className="mt-2 text-neutral-500 text-xs">
            Tools · {message.tool_calls.map((t) => t.tool).join(", ")}
          </Badge>
        ) : null}
        {message.error ? (
          <p className="mt-1 text-[11px] text-semantic-danger">{message.error}</p>
        ) : null}
      </div>
      {!isAssistant ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary-500">
          <User className="h-4 w-4 text-white" />
        </div>
      ) : null}
    </div>
  );
}

export function AssistantPane({
  claimId,
  currentVersion = 1,
  onDoubleClickHeader,
}: AssistantPaneProps) {
  const triggerClaimRefetch = useClaimDetailRefetchStore((s) => s.triggerRefetch);
  const startRegenerating = useClaimRedraftProgressStore((s) => s.startRegenerating);
  const {
    conversations,
    isLoading: convLoading,
    error: convError,
    refetch: refetchConversations,
    createConversation,
  } = useConversations({ mode: "claim_focused" });
  const {
    messages,
    streaming,
    error: streamError,
    stalled,
    sendMessage,
    hydrate,
    reset,
  } = useAssistantStream();

  const [inputValue, setInputValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: claimId is the intentional trigger
  useEffect(() => {
    setCreateError(null);
    setActiveId(null);
    reset();
  }, [claimId, reset]);

  useEffect(() => {
    if (convLoading) return;
    if (streaming) return;
    const existing = conversations.find((c) => c.claim_id === claimId);
    if (existing) {
      setActiveId(existing._id);
      hydrate(wireToUI(existing.messages));
      return;
    }
    if (creating) return;
    if (createError) return;
    setCreating(true);
    void (async () => {
      try {
        const created = await createConversation("claim_focused", claimId);
        setActiveId(created._id);
        hydrate([]);
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : "Failed to start the claim-focused assistant.",
        );
      } finally {
        setCreating(false);
      }
    })();
  }, [
    conversations,
    convLoading,
    claimId,
    creating,
    createError,
    createConversation,
    hydrate,
    streaming,
  ]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages/streaming trigger scroll
  useEffect(() => {
    queueMicrotask(() => {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, [messages, streaming]);

  const runSend = async (text: string) => {
    if (!text.trim() || streaming || !activeId) return;
    const result = await sendMessage(activeId, text.trim());
    if (result && !result.error && result.toolNames.includes("request_redraft")) {
      startRegenerating(claimId, currentVersion);
    }
    if (result && !result.error && result.toolNames.includes("update_send_override")) {
      await triggerClaimRefetch(claimId);
    }
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");
    await runSend(text);
  };

  const handleQuickAction = (action: string) => {
    void runSend(action);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleRetryCreate = () => {
    setCreateError(null);
  };

  const inputDisabled = streaming || !activeId;

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader onDoubleClick={onDoubleClickHeader} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {convError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="mb-3 text-sm">{convError.message}</p>
              <Button type="button" size="sm" variant="outline" onClick={refetchConversations}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {createError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>{createError}</span>
              <Button type="button" size="sm" variant="outline" onClick={handleRetryCreate}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {!activeId && !createError && (convLoading || creating) ? (
          <div className="space-y-4">
            <div className="flex justify-end gap-3">
              <Skeleton className="h-12 w-[55%] rounded-lg" />
            </div>
            <div className="flex justify-start gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-16 w-[75%] rounded-lg" />
            </div>
            <div className="flex justify-end gap-3">
              <Skeleton className="h-12 w-[65%] rounded-lg" />
            </div>
          </div>
        ) : !createError ? (
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Ask about this claim — try a quick action below or type your own question.
              </p>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
            )}
            {streamError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{streamError}</AlertDescription>
              </Alert>
            ) : null}
            {stalled ? (
              <p className="text-neutral-500 text-xs">Response is taking longer than expected…</p>
            ) : null}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        ) : null}
      </div>

      <div className="border-neutral-200 border-t px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => handleQuickAction(action)}
              disabled={inputDisabled}
              className="rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-neutral-700 text-xs transition-colors hover:bg-neutral-100 disabled:opacity-50"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      <div className="border-neutral-200 border-t p-4">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this claim..."
            className="max-h-32 min-h-10 resize-none"
            rows={1}
            disabled={inputDisabled}
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0"
            onClick={() => void handleSend()}
            disabled={!inputValue.trim() || inputDisabled}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
