"use client";

import { AlertCircle, Loader2, Menu, MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MarkdownMessage } from "@/components/assistant/markdown-message";
import { ProactiveCard } from "@/components/assistant/proactive-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
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

// Auto-scroll-to-bottom pins the viewport only when the user is within this
// many pixels of the bottom. Above the threshold, message-list updates do not
// scroll — so a user who scrolled up to re-read history isn't yanked back by
// every incoming token during streaming. 100px matches the feel of ChatGPT /
// Claude.ai (a small slack for trackpad inertial scroll near the bottom).
const AUTOSCROLL_THRESHOLD_PX = 100;

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
  const label = c.title;
  if (c.title === "New Conversation" && c.messages?.length) {
    const firstUser = c.messages.find((m) => m.role === "user");
    if (firstUser) {
      const text = firstUser.content;
      return text.length > 40 ? `${text.slice(0, 40)}…` : text;
    }
  }
  return label;
}

function derivePreview(c: Conversation): string | null {
  if (!c.messages?.length) return null;
  const last = c.messages[c.messages.length - 1].content;
  return last.length > 60 ? `${last.slice(0, 60)}…` : last;
}

type ConversationRowProps = {
  conversation: Conversation;
  displayTitle: string;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (c: Conversation) => void;
  onArchive: (id: string) => void;
  onDelete: (c: Conversation) => void;
};

function ConversationRow({
  conversation,
  displayTitle,
  isActive,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: ConversationRowProps) {
  const preview = derivePreview(conversation);

  return (
    <li className="group relative">
      <Link
        href={`/assistant/${conversation._id}`}
        onClick={() => onSelect(conversation._id)}
        className={cn(
          "flex flex-col gap-0.5 rounded-lg px-3 py-2 pr-10 text-sm transition-colors",
          isActive
            ? "bg-brand-primary-50 text-brand-primary-700"
            : "text-neutral-800 hover:bg-neutral-100",
        )}
      >
        <span className="truncate font-medium leading-snug">{displayTitle}</span>
        {preview ? <span className="truncate text-xs text-neutral-500">{preview}</span> : null}
        <span className="text-[11px] text-neutral-400">
          {formatTimestamp(conversation.last_message_at)}
        </span>
      </Link>
      <div
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2",
          isActive
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
            aria-label={`Actions for ${displayTitle}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRename(conversation);
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onArchive(conversation._id);
              }}
            >
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-semantic-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conversation);
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

type ConversationListProps = {
  conversations: Conversation[];
  currentId: string | null;
  searchQuery: string;
  isLoading: boolean;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onRename: (c: Conversation) => void;
  onArchive: (id: string) => void;
  onDelete: (c: Conversation) => void;
};

function ConversationList({
  conversations,
  currentId,
  searchQuery,
  isLoading,
  onSearchChange,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: ConversationListProps) {
  const groupedList = useMemo(() => groupConversations(conversations), [conversations]);

  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <div className="relative px-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          className="pl-9"
        />
      </div>
      {isLoading && conversations.length === 0 ? (
        <div className="flex items-center gap-2 px-3 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading conversations…
        </div>
      ) : groupedList.length === 0 ? (
        <p className="px-3 text-sm text-neutral-500">
          {searchQuery.trim()
            ? "No matching conversations."
            : "No conversations yet — start one below."}
        </p>
      ) : (
        <div className="space-y-6">
          {groupedList.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {label}
              </p>
              <ul className="space-y-1">
                {items.map((c) => (
                  <ConversationRow
                    key={c._id}
                    conversation={c}
                    displayTitle={deriveTitle(c)}
                    isActive={c._id === currentId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onArchive={onArchive}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssistantContent({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  const {
    conversations,
    isLoading: convLoading,
    error: convError,
    createConversation,
    renameConversation,
    archiveConversation,
    deleteConversation,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevActiveIdRef = useRef<string | null>(null);

  const activeConversations = useMemo(
    () => conversations.filter((c) => c.status === "active"),
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeConversations;
    return activeConversations.filter((c) => deriveTitle(c).toLowerCase().includes(q));
  }, [activeConversations, searchQuery]);

  const active = conversationId ? conversations.find((c) => c._id === conversationId) : undefined;
  const unknownId = Boolean(conversationId) && !active && !convLoading;

  useEffect(() => {
    if (streaming) return;
    const id = active?._id ?? null;
    if (id === prevActiveIdRef.current) return;
    prevActiveIdRef.current = id;
    if (active) hydrate(wireToUI(active.messages));
    else reset();
  }, [active, hydrate, reset, streaming]);

  // Track whether the user is currently near the bottom of the message list.
  // Stored in a ref (not state) so the auto-scroll effect below depends only
  // on `messages` — otherwise every scroll event would re-fire the effect and
  // double-scroll. The ref is read at effect time, so its current value
  // (set by the scroll handler below) is what governs auto-pin behavior.
  const isAtBottomRef = useRef(true);

  // Attach a scroll listener to the actual scrolling element. The shadcn
  // ScrollArea shim doesn't forward refs to its BaseUI Viewport, so we walk
  // up from the bottom sentinel until we find the element with the
  // `data-slot="scroll-area-viewport"` attribute (set by the shim — see
  // components/ui/scroll-area.tsx:20). This isolates us from BaseUI's
  // internal class structure while still letting us measure scroll
  // position on the right element.
  //
  // Dep is `[active?._id]`, NOT `[]`: the active-conversation branch of
  // mainPaneContent only mounts when a conversation is selected, so the
  // bottomRef sentinel doesn't exist on the initial empty-state render.
  // A `[]`-keyed effect would run once with `bottomRef.current === null`
  // and never reattach when the active branch mounts. Keying on the id
  // (the string, not the `active` object reference — the conversations
  // array refetches periodically and replaces the object even when the
  // id is unchanged) makes the effect rerun on conversation
  // load / switch so the listener is always bound to the live viewport.
  // biome-ignore lint/correctness/useExhaustiveDependencies: active?._id is the intentional re-bind trigger; we don't read it inside the body
  useEffect(() => {
    // Conversation switch: pin to bottom regardless of where the user
    // left the previous conversation's scroll. A new conversation
    // should always open at the most-recent message. Mirrors the
    // force-pin in sendDraftIfPossible below.
    isAtBottomRef.current = true;

    const sentinel = bottomRef.current;
    if (!sentinel) return;
    const viewport = sentinel.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    const handler = () => {
      const distFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isAtBottomRef.current = distFromBottom < AUTOSCROLL_THRESHOLD_PX;
    };
    viewport.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => {
      viewport.removeEventListener("scroll", handler);
    };
  }, [active?._id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages` is the intentional trigger; isAtBottomRef.current is read fresh on each tick and intentionally NOT in the dep list
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [messages]);

  async function sendDraftIfPossible() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");

    let convId = active?._id ?? null;
    if (!convId) {
      try {
        const created = await createConversation("general");
        convId = created._id;
        router.push(`/assistant/${convId}`);
      } catch {
        return;
      }
    }
    // When the user sends, force-pin to bottom regardless of previous scroll
    // position — they're signaling intent to follow the new exchange. The
    // scroll handler will update this ref naturally on subsequent user scrolls.
    isAtBottomRef.current = true;
    await sendMessage(convId, text);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void sendDraftIfPossible();
    }
  };

  const handleSelectConversation = (_id: string) => {
    setHistoryOpen(false);
  };

  const handleRenameOpen = (c: Conversation) => {
    setRenameTarget(c);
    setRenameValue(deriveTitle(c));
  };

  const handleRenameSave = async () => {
    if (!renameTarget) return;
    const value = renameValue.trim();
    if (!value) return;
    try {
      await renameConversation(renameTarget._id, value);
      toast.success("Conversation renamed");
      setRenameTarget(null);
    } catch {
      toast.error("Couldn't update conversation");
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveConversation(id);
      toast.success("Conversation archived");
      if (id === conversationId) {
        router.push("/assistant");
      }
    } catch {
      toast.error("Couldn't update conversation");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget._id;
    try {
      await deleteConversation(id);
      toast.success("Conversation deleted");
      setDeleteTarget(null);
      if (id === conversationId) {
        router.push("/assistant");
      }
    } catch {
      toast.error("Couldn't update conversation");
    }
  };

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
                  {msg.role === "assistant" ? (
                    <>
                      <MarkdownMessage text={msg.content} animate={msg.streaming} />
                      {msg.streaming ? (
                        <Loader2
                          aria-hidden
                          className="ml-1 inline-block h-3 w-3 animate-spin text-neutral-500 align-middle"
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
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
        <div className="border-t border-neutral-200 bg-neutral-0 px-4 py-3 lg:px-8 shrink-0">
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

  const listProps = {
    conversations: filteredConversations,
    currentId: conversationId,
    searchQuery,
    isLoading: convLoading,
    onSearchChange: setSearchQuery,
    onSelect: handleSelectConversation,
    onRename: handleRenameOpen,
    onArchive: handleArchive,
    onDelete: setDeleteTarget,
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-neutral-50">
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
        <ScrollArea className="min-h-0 flex-1">
          <ConversationList {...listProps} />
        </ScrollArea>
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
                <ConversationList {...listProps} />
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

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            aria-label="Conversation title"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!renameValue.trim()}
              onClick={() => void handleRenameSave()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              This conversation will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteConfirm()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
