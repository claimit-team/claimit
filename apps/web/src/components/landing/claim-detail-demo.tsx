"use client";

import {
  Clock,
  Edit,
  FileText,
  RotateCcw,
  Send,
  Sparkles,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DEMO = {
  title: "Sony WH-1000XM5 Headphones",
  platform: "Best Buy",
  status: { label: "Awaiting Approval", value: "awaiting_approval" },
  refundAmount: 50.0,
  currency: "USD",
  daysRemaining: 10,
  draft: {
    version: "v1",
    source: "AI draft",
    when: "1 day ago",
    subject: "Price match refund — Order demo-ord-e273a5c7b4",
    body: `Hello Best Buy Customer Care,

I'm writing to request a price match refund on a recent purchase.

Order demo-ord-e273a5c7b4 — Sony WH-1000XM5 Headphones at $399.99. The current price is $349.99, a difference of $50.00 within the published price match window.

Could you please refund the $50.00 difference to my original payment method? I have the order confirmation and a screenshot of the current price ready to share if you need them.

Thank you,
[Your name]`,
  },
  evidence: {
    originalPrice: 399.99,
    currentPrice: 349.99,
    difference: 50.0,
    captured: "May 29, 2026, 11:34 AM",
    source: "Best Buy",
  },
  assistant: {
    initial: `I matched this against Best Buy's published Price Match Guarantee. The current $349.99 is $50 less than what you paid, well within the 30-day window. The draft uses their standard refund request template — formal but not stiff. Want me to soften the tone?`,
  },
} as const;

const QUICK_ACTIONS = [
  "Make it friendlier",
  "Why this template?",
  "Explain the policy match",
  "Switch to manual approval",
] as const;

type QuickAction = (typeof QUICK_ACTIONS)[number];

const SCRIPTED_RESPONSES: Record<QuickAction, string> = {
  "Make it friendlier":
    'Updated to be warmer — added a quick thank-you for past service and swapped "request" for "ask about". Want me to keep going or pull back?',
  "Why this template?":
    'Best Buy\'s price match form is short and structured — order ID, original price, current price, source. I picked the formal request template because their reps respond ~30% faster to that format than to casual asks. Their policy page also asks for "order confirmation" specifically, which is why I added that line.',
  "Explain the policy match":
    "Best Buy's Price Match Guarantee covers identical in-stock items, including their own listed price drops. Your Sony WH-1000XM5 purchase qualifies because: (1) same SKU on bestbuy.com, (2) you're inside the 30-day window with 10 days remaining, (3) the $50 drop is verifiable in their catalog. The price match is automatic — you'll get a refund credit, not a return.",
  "Switch to manual approval":
    "You're already in manual approval mode — I draft, you approve before anything is sent. If you ever want me to send claims under a set dollar amount automatically, you can enable autopilot in Settings → Automation.",
};

const TIMING = {
  startDelay: 400,
  bodyTypeMs: 8,
  switchToAssistantAt: 4200,
  assistantTypeMs: 18,
  watchAgainDelay: 600,
} as const;

type Phase =
  | { kind: "idle" }
  | { kind: "playing-draft" }
  | { kind: "playing-assistant" }
  | { kind: "done-auto" }
  | { kind: "scripted-response"; action: QuickAction };

type DemoTab = "draft" | "evidence" | "assistant";

function useTypewriter(
  fullText: string,
  enabled: boolean,
  msPerChar: number,
): { text: string; done: boolean } {
  const [index, setIndex] = useState(0);

  // Reset index when the target string changes (e.g. scripted chip reply).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fullText must reset the cursor
  useEffect(() => {
    setIndex(0);
  }, [fullText]);

  useEffect(() => {
    if (!enabled) {
      setIndex(0);
      return;
    }
    if (index >= fullText.length) return;
    const id = window.setTimeout(() => setIndex((i) => i + 1), msPerChar);
    return () => window.clearTimeout(id);
  }, [enabled, index, fullText, msPerChar]);

  return {
    text: fullText.slice(0, index),
    done: index >= fullText.length,
  };
}

export function ClaimDetailDemo() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [activeTab, setActiveTab] = useState<DemoTab>("draft");
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const inView = useInView(containerRef, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const beginAutoPlay = useCallback(() => {
    clearTimers();
    setActiveTab("draft");
    setPhase({ kind: "idle" });

    if (reduceMotion) {
      setPhase({ kind: "done-auto" });
      setHasPlayedOnce(true);
      setActiveTab("assistant");
      return;
    }

    timersRef.current.push(
      window.setTimeout(() => {
        setPhase({ kind: "playing-draft" });
      }, TIMING.startDelay),
    );
    timersRef.current.push(
      window.setTimeout(() => {
        setActiveTab("assistant");
        setPhase({ kind: "playing-assistant" });
      }, TIMING.switchToAssistantAt),
    );
  }, [clearTimers, reduceMotion]);

  useEffect(() => {
    if (!inView || hasPlayedOnce) return;
    beginAutoPlay();
    return clearTimers;
  }, [inView, hasPlayedOnce, beginAutoPlay, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const draftPlaying = phase.kind === "playing-draft";
  const assistantPlaying = phase.kind === "playing-assistant";
  const scriptedPlaying = phase.kind === "scripted-response";

  const draftTypewriterEnabled =
    draftPlaying ||
    phase.kind === "playing-assistant" ||
    phase.kind === "done-auto" ||
    phase.kind === "scripted-response";

  const { text: draftText, done: draftDone } = useTypewriter(
    DEMO.draft.body,
    draftTypewriterEnabled,
    TIMING.bodyTypeMs,
  );

  const assistantFullText =
    phase.kind === "scripted-response" ? SCRIPTED_RESPONSES[phase.action] : DEMO.assistant.initial;

  const assistantTypewriterEnabled =
    assistantPlaying || scriptedPlaying || (phase.kind === "done-auto" && !reduceMotion);

  const { text: assistantText, done: assistantDone } = useTypewriter(
    assistantFullText,
    assistantTypewriterEnabled,
    TIMING.assistantTypeMs,
  );

  useEffect(() => {
    if (phase.kind === "playing-assistant" && assistantDone) {
      const t = window.setTimeout(() => {
        setPhase({ kind: "done-auto" });
        setHasPlayedOnce(true);
      }, TIMING.watchAgainDelay);
      return () => window.clearTimeout(t);
    }
  }, [phase, assistantDone]);

  const handleChipClick = (action: QuickAction) => {
    clearTimers();
    setActiveTab("assistant");
    setPhase({ kind: "scripted-response", action });
    setHasPlayedOnce(true);
  };

  const handleWatchAgain = () => {
    clearTimers();
    setActiveTab("draft");
    setPhase({ kind: "idle" });
    setHasPlayedOnce(false);
  };

  const handleTabChange = (value: string) => {
    const next = value as DemoTab;
    setActiveTab(next);
    if (phase.kind === "playing-draft" || phase.kind === "playing-assistant") {
      clearTimers();
      setPhase({ kind: "done-auto" });
      setHasPlayedOnce(true);
    }
  };

  const draftDisplay = phase.kind === "idle" ? "" : draftPlaying ? draftText : DEMO.draft.body;

  const assistantDisplay =
    phase.kind === "idle"
      ? ""
      : phase.kind === "done-auto"
        ? DEMO.assistant.initial
        : assistantText;

  const showDraftCursor = draftPlaying && !draftDone;
  const showAssistantCursor = (assistantPlaying || scriptedPlaying) && !assistantDone;

  return (
    <div className="mx-auto mt-10 max-w-md" ref={containerRef}>
      <p className="text-center text-sm text-neutral-500">See Step 3 in action</p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-0 shadow-sm">
        <div className="border-neutral-200 border-b bg-neutral-0 px-4 py-3">
          <div className="text-neutral-500 text-xs">← Claims / {DEMO.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-primary-50 px-2 py-0.5 font-medium text-brand-primary-500 text-xs ring-1 ring-brand-primary-500/20">
              {DEMO.status.label}
            </span>
            <span className="text-neutral-500 text-sm">{DEMO.platform}</span>
            <span className="text-neutral-300 text-sm">·</span>
            <span className="font-medium text-neutral-700 text-sm">
              ${DEMO.refundAmount.toFixed(2)}
            </span>
            <span className="text-neutral-300 text-sm">·</span>
            <span className="flex items-center gap-1 text-semantic-warning text-sm">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {DEMO.daysRemaining} days remaining
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="inline-flex cursor-default items-center gap-1 rounded-md border border-neutral-200 bg-transparent px-2.5 py-1 font-medium text-neutral-700 text-xs"
              tabIndex={-1}
              aria-disabled
            >
              <Edit className="h-3 w-3" aria-hidden />
              Edit draft
            </button>
            <button
              type="button"
              className="inline-flex cursor-default items-center gap-1 rounded-md border border-neutral-200 bg-transparent px-2.5 py-1 font-medium text-semantic-danger text-xs"
              tabIndex={-1}
              aria-disabled
            >
              <XCircle className="h-3 w-3" aria-hidden />
              Cancel claim
            </button>
            <button
              type="button"
              className="inline-flex cursor-default items-center gap-1 rounded-md bg-brand-primary-500 px-2.5 py-1 font-medium text-neutral-0 text-xs"
              tabIndex={-1}
              aria-disabled
            >
              <Send className="h-3 w-3" aria-hidden />
              Approve and send
            </button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col">
          <div className="border-neutral-200 border-b px-2">
            <TabsList className="h-10 w-full bg-transparent">
              <TabsTrigger value="draft" className="flex-1 text-xs data-active:bg-neutral-100">
                Draft
              </TabsTrigger>
              <TabsTrigger value="evidence" className="flex-1 text-xs data-active:bg-neutral-100">
                Evidence
              </TabsTrigger>
              <TabsTrigger value="assistant" className="flex-1 text-xs data-active:bg-neutral-100">
                Assistant
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="draft" className="m-0 min-h-[420px] bg-neutral-50 p-3">
            <div className="mb-2 text-neutral-500 text-xs">
              {DEMO.draft.version} · {DEMO.draft.source} · {DEMO.draft.when}
            </div>
            <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
              <div className="flex">
                <span className="w-16 shrink-0 text-neutral-500">Subject:</span>
                <span className="text-neutral-900">{DEMO.draft.subject}</span>
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-0 p-3">
              <div className="min-h-[280px] whitespace-pre-wrap text-neutral-700 text-xs leading-relaxed">
                {draftDisplay}
                {showDraftCursor ? (
                  <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-neutral-400 align-middle" />
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evidence" className="m-0 min-h-[420px] bg-neutral-50 p-3">
            <Card className="border-neutral-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <TrendingDown className="h-3.5 w-3.5 text-semantic-warning" aria-hidden />
                  Current price
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div className="space-y-0.5">
                    <div className="text-neutral-500 text-xs tabular-nums">
                      Original: ${DEMO.evidence.originalPrice.toFixed(2)}
                    </div>
                    <div className="font-semibold text-2xl text-neutral-900 tabular-nums">
                      ${DEMO.evidence.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-lg text-semantic-warning tabular-nums">
                      -${DEMO.evidence.difference.toFixed(2)}
                    </div>
                    <div className="text-neutral-500 text-xs">difference</div>
                  </div>
                </div>
                <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
                  <div className="text-neutral-500 text-xs">Captured: {DEMO.evidence.captured}</div>
                  <div className="mt-1 text-neutral-700 text-xs">
                    Price drop detected by ClaimIt monitor-agent
                  </div>
                </div>
                <div className="mt-2 text-neutral-500 text-xs">
                  Source: <span className="text-brand-primary-500">{DEMO.evidence.source}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="mt-3 border-neutral-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Best Buy price match policy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-neutral-600 text-xs leading-relaxed">
                  We&apos;ll match the price of select online and local retail competitors. Within
                  30 days of purchase, we&apos;ll refund the difference if our price drops.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="assistant"
            className="m-0 flex min-h-[420px] flex-col bg-neutral-50 p-3"
          >
            <div className="flex-1 space-y-3 overflow-hidden">
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                  <Sparkles className="h-3 w-3 text-neutral-500" aria-hidden />
                </div>
                <div className="max-w-[88%] rounded-lg bg-neutral-100 px-3 py-2 text-neutral-900 text-xs leading-relaxed">
                  {assistantDisplay}
                  {showAssistantCursor ? (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-neutral-500 align-middle" />
                  ) : null}
                </div>
              </div>
              {phase.kind === "scripted-response" ? (
                <div className="flex items-start justify-end gap-2">
                  <div className="max-w-[80%] rounded-lg bg-brand-primary-500 px-3 py-2 text-neutral-0 text-xs">
                    {phase.action}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 border-neutral-200 border-t pt-3">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => handleChipClick(action)}
                  className="rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-neutral-700 text-xs transition-colors hover:bg-neutral-100"
                >
                  {action}
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {phase.kind === "done-auto" ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-4 flex justify-center"
        >
          <Button variant="outline" size="sm" onClick={handleWatchAgain} className="text-xs">
            <RotateCcw className="mr-1.5 h-3 w-3" aria-hidden />
            Watch again
          </Button>
        </motion.div>
      ) : null}
    </div>
  );
}
