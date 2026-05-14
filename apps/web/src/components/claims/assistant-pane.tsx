"use client";

import { Bot, Send, Sparkles, User } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ClaimConversation, ClaimMessage } from "@/lib/claim-detail-types";
import { cn } from "@/lib/utils";

interface AssistantPaneProps {
  conversation: ClaimConversation;
  onSendMessage?: (message: string) => void;
  onDoubleClickHeader?: () => void;
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
        Mode: Claim-focused
      </Badge>
    </button>
  );
}

function MessageBubble({ message }: { message: ClaimMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={cn("flex gap-3", isAssistant ? "justify-start" : "justify-end")}>
      {isAssistant ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
          <Bot className="h-4 w-4 text-neutral-600" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5",
          isAssistant ? "bg-neutral-100 text-neutral-700" : "bg-brand-primary-500 text-white",
        )}
      >
        <p className="text-sm leading-relaxed">{message.content}</p>
        {message.toolSummary ? (
          <Badge variant="secondary" className="mt-2 bg-neutral-200/50 text-neutral-500 text-xs">
            {message.toolSummary}
          </Badge>
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

const QUICK_ACTIONS = [
  "Make it friendlier",
  "Why this template?",
  "Make it shorter",
  "Explain the policy match",
];

export function AssistantPane({
  conversation,
  onSendMessage,
  onDoubleClickHeader,
}: AssistantPaneProps) {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ClaimMessage[]>(conversation.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    queueMicrotask(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const nextUser: ClaimMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue,
    };
    setMessages((prev) => [...prev, nextUser]);
    scrollToBottom();
    onSendMessage?.(inputValue);

    window.setTimeout(() => {
      const reply: ClaimMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "I've noted your feedback. In production this would regenerate the draft and cite the exact policy language we relied on.",
      };
      setMessages((prev) => [...prev, reply]);
      scrollToBottom();
    }, 500);

    setInputValue("");
  };

  const handleQuickAction = (action: string) => {
    setInputValue(action);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader onDoubleClick={onDoubleClickHeader} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </div>

      <div className="border-neutral-200 border-t px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => handleQuickAction(action)}
              className="rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-neutral-700 text-xs transition-colors hover:bg-neutral-100"
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
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0"
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
