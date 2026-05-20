"use client";

import { AlertCircle, Loader2, Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { ProactiveCard } from "@/components/assistant/proactive-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantStream } from "@/hooks/useAssistantStream";
import { useConversations } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import type { Conversation, UIMessage, WireConversationMessage } from "@/types/assistant";

const EXAMPLE_PROMPTS: string[] = [
  "Summarize Hilton best-rate rules for Waikiki prepaid stays.",
  "What screenshots should I upload for Southwest refund chat?",
  "Rewrite Delta schedule-change email politely but firmly.",
];

type Bucket = "Today" | "Yesterday" | "Last 7 days" | "Older";
const BUCKET_ORDER: Bucket[] = ["Today", "Yesterday", "Last 7 days", "Older"];

function bucketFor(isoTimestamp: string): Bucket {
  const then = new Date(isoTimestamp);
  if (Number.isNaN(then.getTime())) return "Older";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = then.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (ts >= today) return "Today";
  if (ts >= today - dayMs) return "Yesterday";
  if (ts >= today - 7 * dayMs) return "Last 7 days";
  return "Older";
}

function formatTimestamp(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function wireToUI(messages: WireConversationMessage[]): UIMessage[] {
  return messages.map((m, idx) => ({
    id: `srv-${idx}-${m.at}`,
    role: m.role,
    content: m.content,
    at: m.at,
    tool_calls: m.tool_calls?.map((tc) => ({
      tool: tc.tool,
      input: tc.input,
      output_summary: tc.output_summary,
    })),
  }));
}

function groupConversations(
  conversations: Conversation[],
): { label: Bucket; items: Conversation[] }[] {
  const buckets = new Map<Bucket, Conversation[]>();
  for (const b of BUCKET_ORDER) buckets.set(b, []);
  for (const c of conversations) {
    const b = bucketFor(c.last_message_at);
    buckets.get(b)?.push(c);
  }
  return BUCKET_ORDER.map((label) => ({ label, items: buckets.get(label) ?? [] })).filter(
    (g) => g.items.length > 0,
  );
}

function deriveTitle(c: Conversation): string {
  if (c.title && c.title !== "New Conversation") return c.title;
  const firstUser = c.messages.find((m) => m.role === "user");
  if (firstUser) return firstUser.content.slice(0, 60);
  return c.mode === "claim_focused" ? "Claim conversation" : "New conversation";
}

function derivePreview(c: Conversation): string {
  if (c.messages.length === 0) return "No messages yet";
  return c.messages[c.messages.length - 1].content.slice(0, 90);
}

export function AssistantContent({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  const {
    conversations,
    isLoading: convLoading,
    error: convError,
    createConversation,
  } = useConversations({ mode: "general" });
  const {
    messages,
    streaming,
    error: streamError,
    sendMessage,
    hydrate,
    reset,
  } = useAssistantStream();

  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Sentinel at the bottom of the message list. scrollIntoView walks up
  // to find the actual scroll parent (the shadcn ScrollArea Viewport),
  // unlike scrollTop on a wrapper div which was a silent no-op inside
  // the Viewport hierarchy.
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const active = conversationId ? conversations.find((c) => c.id === conversationId) : undefined;
  const unknownId = Boolean(conversationId) && !active && !convLoading;

  // Hydrate local stream buffer with the active conversation's persisted
  // messages whenever the active conversation changes. The stream
  // continues to layer streaming messages on top.
  useEffect(() => {
    if (active) {
      hydrate(wireToUI(active.messages));
    } else {
      reset();
    }
  }, [active, hydrate, reset]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the intentional trigger for the scroll effect even though the body doesn't read it
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  const groupedList = useMemo(() => groupConversations(conversations), [conversations]);

  async function sendDraftIfPossible() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");

    let convId = active?.id ?? null;
    if (!convId) {
      try {
        const created = await createConversation("general");
        convId = created.id;
        router.push(`/assistant/${convId}`);
      } catch {
        return;
      }
    }
    await sendMessage(convId, text);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void sendDraftIfPossible();
    }
  };

  const conversationLinks: ReactNode = (
    <div className="px-3 py-4 space-y-6">
      {convLoading && conversations.length === 0 ? (
        <div className="flex items-center gap-2 px-3 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading conversations…
        </div>
      ) : groupedList.length === 0 ? (
        <p className="px-3 text-sm text-neutral-500">No conversations yet — start one below.</p>
      ) : (
        groupedList.map(({ label, items }) => (
          <div key={label}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              {label}
            </p>
            <ul className="space-y-1">
              {items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/assistant/${c.id}`}
                    onClick={() => setHistoryOpen(false)}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      c.id === conversationId
                        ? "bg-brand-primary-50 text-brand-primary-900"
                        : "text-neutral-800 hover:bg-neutral-100",
                    )}
                  >
                    <span className="truncate font-medium leading-snug">{deriveTitle(c)}</span>
                    <span className="truncate text-xs text-neutral-500">{derivePreview(c)}</span>
                    <span className="text-[11px] text-neutral-400">
                      {formatTimestamp(c.last_message_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );

  let mainPaneContent: ReactNode;

  if (unknownId) {
    mainPaneContent = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-lg font-semibold text-neutral-900">Conversation not found</h2>
        <p className="max-w-md text-sm text-neutral-600">
          Start a new one or pick a conversation from the history list.
        </p>
        <Button type="button" variant="outline" onClick={() => router.push("/assistant")}>
          New conversation
        </Button>
      </div>
    );
  } else if (!active) {
    mainPaneContent = (
      <>
        <div className="flex flex-1 flex-col px-8 py-12 overflow-y-auto">
          <div className="mx-auto flex max-w-lg flex-col gap-6">
            <ProactiveCard />
            <div className="text-center md:text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary-600">
                ClaimIt Assistant
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                What do you want to tackle?
              </h1>
              <p className="mt-3 text-neutral-600 text-sm leading-relaxed">
                Ask about airlines, hospitality policies, drafting chat scripts — or riff on an open
                claim.
              </p>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium text-neutral-500">Try:</p>
              <div className="flex flex-col gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="secondary"
                    className="justify-start text-left whitespace-normal h-auto py-3"
                    onClick={() => setDraft(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-neutral-200 bg-neutral-0 px-4 py-3 lg:px-8 shrink-0">
          <div className="mx-auto flex max-w-4xl gap-3 items-end flex-wrap md:flex-nowrap">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message to start a new conversation…"
              aria-label="Draft assistant message"
              className="min-h-[56px]"
              rows={3}
              disabled={streaming}
            />
            <Button
              type="button"
              className="shrink-0 bg-brand-primary-600 text-neutral-0 hover:bg-brand-primary-700"
              onClick={() => void sendDraftIfPossible()}
              disabled={!draft.trim() || streaming}
            >
              Send
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-neutral-400">
            Ctrl/Cmd + Enter to send — a new conversation is created on first message.
          </p>
        </div>
      </>
    );
  } else {
    mainPaneContent = (
      <>
        <div className="hidden shrink-0 border-b border-neutral-200 bg-neutral-0 px-6 py-4 md:flex">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Assistant
            </p>
            <h2 className="text-lg font-semibold text-neutral-900">{deriveTitle(active)}</h2>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 py-6 lg:px-10">
            <ProactiveCard />
            {messages.map((msg) => (
              <article
                key={msg.id}
                className={cn(
                  "flex max-w-3xl",
                  msg.role === "user" ? "ml-auto flex-col items-end text-right" : "mr-auto",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ring-1",
                    msg.role === "user"
                      ? "bg-brand-primary-600 text-neutral-0 ring-brand-primary-600/80"
                      : "bg-neutral-0 text-neutral-900 ring-neutral-100",
                  )}
                >
                  {msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0 && (
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-primary-500">
                      Tools · {msg.tool_calls.map((t) => t.tool).join(", ")}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">
                    {msg.content}
                    {msg.streaming && msg.role === "assistant" ? (
                      <Loader2
                        aria-hidden
                        className="ml-1 inline-block h-3 w-3 animate-spin text-neutral-500 align-middle"
                      />
                    ) : null}
                  </p>
                </div>
                {msg.error ? (
                  <span className="text-[11px] text-semantic-danger mt-1">{msg.error}</span>
                ) : null}
              </article>
            ))}
            {streamError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{streamError}</AlertDescription>
              </Alert>
            ) : null}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </ScrollArea>
        <div className="border-t border-neutral-200 bg-neutral-0 px-4 py-3 lg:px-8">
          <div className="mx-auto flex max-w-4xl gap-3 items-end flex-wrap md:flex-nowrap">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the assistant..."
              aria-label="Message the assistant"
              className="min-h-[56px]"
              rows={3}
              disabled={streaming}
            />
            <Button
              type="button"
              className="shrink-0 bg-brand-primary-600 text-neutral-0 hover:bg-brand-primary-700"
              onClick={() => void sendDraftIfPossible()}
              disabled={!draft.trim() || streaming}
            >
              Send
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-neutral-400">
            Ctrl/Cmd + Enter to send.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-neutral-50">
      {/* Desktop conversation list */}
      <aside className="hidden min-h-0 w-[280px] shrink-0 border-r border-neutral-200 bg-neutral-0 md:flex md:flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-200 p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => router.push("/assistant")}
          >
            New chat
          </Button>
        </div>
        {convError ? (
          <Alert variant="destructive" className="mx-3 mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{convError.message}</AlertDescription>
          </Alert>
        ) : null}
        <ScrollArea className="min-h-0 flex-1">{conversationLinks}</ScrollArea>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-0 px-4 py-3 md:hidden shrink-0">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger
              type="button"
              className="rounded-lg border border-neutral-200 p-2 text-neutral-700 hover:bg-neutral-50"
              aria-label="Open conversations"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 gap-0">
              <SheetTitle className="sr-only">Assistant history</SheetTitle>
              <ScrollArea className="h-[100dvh]">
                <div className="border-b border-neutral-200 p-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setHistoryOpen(false);
                      router.push("/assistant");
                    }}
                  >
                    New chat
                  </Button>
                </div>
                {conversationLinks}
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Assistant
            </p>
            <p className="truncate font-medium text-neutral-900">
              {active ? deriveTitle(active) : "Pick a conversation"}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/assistant")}
          >
            New
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{mainPaneContent}</div>
      </div>
    </div>
  );
}
