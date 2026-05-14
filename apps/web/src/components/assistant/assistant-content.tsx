"use client";

import { Menu, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSISTANT_GROUP_ORDER,
  type AssistantConversation,
  type AssistantMessage,
  mockExamplePrompts,
  mockConversations as seedConversations,
} from "@/lib/mock-assistant";
import { cn } from "@/lib/utils";

function groupBuckets(conversations: AssistantConversation[]) {
  const buckets = new Map<string, AssistantConversation[]>();
  for (const bucket of ASSISTANT_GROUP_ORDER) {
    buckets.set(bucket, []);
  }
  for (const c of conversations) {
    buckets.get(c.group)?.push(c);
  }
  return ASSISTANT_GROUP_ORDER.map((label) => ({
    label,
    items: buckets.get(label) ?? [],
  })).filter((g) => g.items.length > 0);
}

export function AssistantContent({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  const [conversations, setConversations] = useState(seedConversations);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const active = conversationId ? conversations.find((c) => c.id === conversationId) : undefined;

  const unknownId = Boolean(conversationId) && conversations.every((c) => c.id !== conversationId);

  const groupedList = useMemo(() => groupBuckets(conversations), [conversations]);

  function appendMessage(
    convId: string,
    message: Omit<AssistantMessage, "id"> & Partial<Pick<AssistantMessage, "id">>,
  ) {
    const withId: AssistantMessage = {
      ...message,
      id:
        typeof message.id === "string"
          ? message.id
          : typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `m-${Date.now()}`,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, withId],
              preview: withId.content.slice(0, 140),
            }
          : c,
      ),
    );
  }

  function sendDraftIfPossible() {
    const text = draft.trim();
    if (!text || !active) return;

    appendMessage(active.id, { role: "user", content: text });
    setDraft("");
    toast.message("Assistant (demo)", {
      description: "Full agent wiring ships later — conversation updated locally.",
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setConversations((prev) => prev.filter((c) => c.id !== deleteTarget));

    const shouldLeave = conversationId === deleteTarget;
    setDeleteTarget(null);
    if (shouldLeave) router.push("/assistant");

    toast.success("Conversation removed");
  }

  const conversationLinks: ReactNode = (
    <div className="px-3 py-4 space-y-6">
      {groupedList.map(({ label, items }) => (
        <div key={label}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {label}
          </p>
          <ul className="space-y-1">
            {items.map((c) => (
              <li key={c.id} className="relative group/item">
                <Link
                  href={`/assistant/${c.id}`}
                  onClick={() => setHistoryOpen(false)}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-lg px-3 py-2 pr-11 text-sm transition-colors",
                    c.id === conversationId
                      ? "bg-brand-primary-50 text-brand-primary-900"
                      : "text-neutral-800 hover:bg-neutral-100",
                  )}
                >
                  <span className="truncate font-medium leading-snug">{c.title}</span>
                  <span className="truncate text-xs text-neutral-500">{c.preview}</span>
                  <span className="text-[11px] text-neutral-400">{c.timestamp}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete conversation ${c.title}`}
                  className={cn(
                    "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-500 opacity-75 hover:bg-neutral-200 hover:text-neutral-900 md:opacity-0 md:group-hover/item:opacity-100",
                  )}
                  onClick={(evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    setDeleteTarget(c.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
                {mockExamplePrompts.map((prompt) => (
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
              placeholder="Draft a prompt, then choose a conversation to send it..."
              aria-label="Draft assistant message"
              className="min-h-[56px]"
              rows={3}
            />
            <Button type="button" variant="secondary" className="shrink-0" disabled>
              Send
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-neutral-400">
            Open a conversation from the sidebar to send messages (demo shell).
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
            <h2 className="text-lg font-semibold text-neutral-900">{active.title}</h2>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 py-6 lg:px-10">
            {active.messages.map((msg) => (
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
                  {msg.role === "assistant" && msg.toolSummary && (
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-primary-500">
                      Tools · {msg.toolSummary}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>
        <div className="border-t border-neutral-200 bg-neutral-0 px-4 py-3 lg:px-8">
          <div className="mx-auto flex max-w-4xl gap-3 items-end flex-wrap md:flex-nowrap">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the assistant..."
              aria-label="Message the assistant"
              className="min-h-[56px]"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  sendDraftIfPossible();
                }
              }}
            />
            <Button
              type="button"
              className="shrink-0 bg-brand-primary-600 text-neutral-0 hover:bg-brand-primary-700"
              onClick={sendDraftIfPossible}
              disabled={!draft.trim()}
            >
              Send
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-neutral-400">
            Ctrl/Cmd + Enter to send • Demo transcripts only refresh locally for now.
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
              {active?.title ?? "Pick a conversation"}
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

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove conversation?</DialogTitle>
            <DialogDescription>
              This only removes it from local demo history for now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              className="bg-semantic-danger hover:bg-semantic-danger/90"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
