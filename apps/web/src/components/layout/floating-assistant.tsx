"use client";

import { Loader2, MessageSquareText, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ProactiveCard } from "@/components/assistant/proactive-card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantStream } from "@/hooks/useAssistantStream";
import { useConversations } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

type FloatingAssistantProps = {
  /** On claim detail, FAB becomes a slim pill toggling embedded pane expansion (batch 6) */
  variant?: "default" | "pill";
};

/**
 * Floating Assistant button + slide-over with a working chat thread.
 *
 * The chat thread is a stripped-down version of /assistant — single
 * active general-mode conversation, no history list (full UI lives at
 * /assistant). Designed for quick "tell me about this proactive event"
 * interactions: read the surfaced ProactiveCard, optionally chat, dismiss.
 *
 * On claim-detail routes the FAB becomes a "pill" variant that just
 * expands/collapses the embedded claim-focused assistant pane — no
 * separate slide-over there.
 */
export function FloatingAssistant({ variant = "default" }: FloatingAssistantProps) {
  const router = useRouter();

  const open = useUIStore((s) => s.assistantPaneOpen);
  const toggle = useUIStore((s) => s.toggleAssistantPane);
  const proactiveEvent = useUIStore((s) => s.proactiveEvent);
  const clearProactiveEvent = useUIStore((s) => s.clearProactiveEvent);
  const openUploadDialog = useUIStore((s) => s.setUploadDialogOpen);

  const embeddedExpanded = useUIStore((s) => s.claimEmbeddedAssistantExpanded);
  const toggleEmbedded = useUIStore((s) => s.toggleClaimEmbeddedAssistant);

  // All hooks must be unconditional — declare handleAction before the
  // `variant === "pill"` early return below.
  const handleAction = useCallback(
    (action: string) => {
      // Quick-action router. Keep the action ids in sync with the
      // proactive-templates.ts emitters. Unknown actions are a no-op
      // so a new template can ship without crashing existing clients.
      switch (action) {
        case "navigate_claim":
        case "approve_claim":
        case "cancel_claim":
        case "redraft":
        case "explain_claim":
        case "resolve_claim": {
          // For now all claim-related actions just deep-link to the
          // claims index. Once individual claim ids are surfaced in
          // the proactive payload, route to /claims/[id] directly.
          router.push("/claims");
          clearProactiveEvent();
          return;
        }
        case "navigate_dashboard":
          router.push("/dashboard");
          clearProactiveEvent();
          return;
        case "navigate_upload":
          // Ticket 5.14 B2 replaced the /upload route with a global
          // dialog. Open it without leaving the current page.
          openUploadDialog(true);
          clearProactiveEvent();
          return;
        case "confirm_purchase":
        case "edit_purchase":
        case "dismiss_purchase":
          // Confirmation flow lives at /confirm/[purchaseId] — without
          // the id in the payload we redirect to /purchases. The B9
          // commit replaces this fallback with a real route based on
          // the proactive payload's `purchase_id`.
          router.push("/purchases");
          clearProactiveEvent();
          return;
        case "open_chat":
          router.push("/assistant");
          clearProactiveEvent();
          return;
        case "start_tour":
        case "share":
        case "dismiss":
          clearProactiveEvent();
          return;
        default:
          // Unknown — just dismiss so the user isn't stuck.
          clearProactiveEvent();
      }
    },
    [router, clearProactiveEvent, openUploadDialog],
  );

  if (variant === "pill") {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          type="button"
          onClick={toggleEmbedded}
          aria-expanded={embeddedExpanded}
          aria-label={embeddedExpanded ? "Shrink assistant panel" : "Expand assistant panel"}
          className={cn(
            "h-11 rounded-full shadow-lg px-4 gap-2 transition-colors inline-flex items-center justify-center border border-neutral-200",
            embeddedExpanded
              ? "bg-neutral-800 text-neutral-0 hover:bg-neutral-700"
              : "bg-neutral-0 text-neutral-900 hover:bg-neutral-50",
          )}
        >
          {embeddedExpanded ? (
            <>
              <X className="w-5 h-5 shrink-0" aria-hidden />
              <span className="text-sm font-medium">Shrink</span>
            </>
          ) : (
            <>
              <MessageSquareText className="w-5 h-5 shrink-0 text-brand-primary-600" aria-hidden />
              <span className="text-sm font-medium text-neutral-900">Assistant</span>
            </>
          )}
        </Button>
      </div>
    );
  }

  const hasProactive = proactiveEvent !== null;
  const showPulse = hasProactive && !open;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="relative w-12 h-12 md:w-14 md:h-14">
        {showPulse ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full ring-2 ring-brand-accent-500 animate-ping"
          />
        ) : null}
        <Button
          type="button"
          onClick={toggle}
          size="icon"
          aria-expanded={open}
          aria-controls="assistant-pane"
          aria-label={open ? "Close assistant" : "Open assistant"}
          className={cn(
            "relative w-12 h-12 md:w-14 md:h-14 rounded-full shadow-lg transition-colors",
            open
              ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-0"
              : "bg-brand-primary-500 hover:bg-brand-primary-600 text-neutral-0",
          )}
        >
          {open ? (
            <X className="w-6 h-6" aria-hidden="true" />
          ) : (
            <MessageSquareText className="w-6 h-6" aria-hidden="true" />
          )}
        </Button>
      </div>

      {open ? <FloatingPanel onActionClick={handleAction} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal panel — only mounted when the FAB is open. Keeping it as a
// separate component lets us bail out of useConversations / useAssistantStream
// effects entirely when the panel is closed.
// ---------------------------------------------------------------------------

function FloatingPanel({ onActionClick }: { onActionClick: (a: string) => void }) {
  const { currentConversation, createConversation } = useConversations({ mode: "general" });
  const { messages, streaming, error, sendMessage, reset } = useAssistantStream();

  const [draft, setDraft] = useState("");
  // Sentinel pinned at the bottom of the message list — scrollIntoView
  // walks up to find the actual scroll parent (the shadcn ScrollArea
  // Viewport), avoiding the previous bug where setting scrollTop on the
  // wrong wrapper element was a silent no-op.
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const conversationIdRef = useRef<string | null>(currentConversation?._id ?? null);

  useEffect(() => {
    conversationIdRef.current = currentConversation?._id ?? null;
  }, [currentConversation]);

  // Reset the local stream buffer when no conversation is selected so a
  // stale send doesn't leak between sessions.
  useEffect(() => {
    if (!currentConversation) reset();
  }, [currentConversation, reset]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the intentional trigger for the scroll effect even though the body doesn't read it
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");

    let convId = conversationIdRef.current;
    if (!convId) {
      try {
        const created = await createConversation("general");
        convId = created._id;
        conversationIdRef.current = convId;
      } catch {
        // useAssistantStream surfaces its own errors; conversation
        // creation failure short-circuits here.
        return;
      }
    }
    await sendMessage(convId, text);
  }, [draft, streaming, createConversation, sendMessage]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSend();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div
      id="assistant-pane"
      role="dialog"
      aria-label="ClaimIt Assistant"
      className="absolute bottom-16 right-0 w-[22rem] sm:w-[26rem] bg-neutral-0 border border-neutral-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[36rem]"
    >
      <div className="p-4 bg-brand-primary-500 text-neutral-0">
        <h3 className="font-semibold">ClaimIt Assistant</h3>
        <p className="text-sm text-brand-primary-100">Ask me anything about your claims</p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 p-4">
          <ProactiveCard onAction={onActionClick} />

          {messages.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No messages yet — ask about a purchase, claim, or platform policy.
            </p>
          ) : (
            messages.map((m) => (
              <article
                key={m.id}
                className={cn(
                  "flex flex-col gap-1 max-w-[85%]",
                  m.role === "user" ? "ml-auto items-end" : "mr-auto items-start",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ring-1",
                    m.role === "user"
                      ? "bg-brand-primary-600 text-neutral-0 ring-brand-primary-600/80"
                      : "bg-neutral-50 text-neutral-900 ring-neutral-200",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {m.content}
                    {m.streaming && m.role === "assistant" ? (
                      <Loader2
                        aria-hidden
                        className="ml-1 inline-block h-3 w-3 animate-spin text-neutral-500 align-middle"
                      />
                    ) : null}
                  </p>
                  {m.tool_calls && m.tool_calls.length > 0 ? (
                    <p className="mt-1.5 text-[11px] uppercase tracking-wide text-brand-primary-700/70">
                      Tools · {m.tool_calls.map((t) => t.tool).join(", ")}
                    </p>
                  ) : null}
                </div>
                {m.error ? (
                  <span className="text-[11px] text-semantic-danger">{m.error}</span>
                ) : null}
              </article>
            ))
          )}

          {error ? (
            <p className="text-xs text-semantic-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="border-t border-neutral-200 bg-neutral-0 p-3 shrink-0"
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the assistant..."
            aria-label="Message the assistant"
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            disabled={streaming}
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 bg-brand-primary-600 text-neutral-0 hover:bg-brand-primary-700"
            disabled={!draft.trim() || streaming}
            aria-label="Send"
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}
