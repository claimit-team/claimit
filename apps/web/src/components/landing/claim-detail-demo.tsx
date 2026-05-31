"use client";

import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Edit,
  FileText,
  Mail,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    subject: "Price match refund for Order demo-ord-e273a5c7b4",
    body: `Hello Best Buy Customer Care,

I'm writing about a recent purchase. Order demo-ord-e273a5c7b4 for Sony WH-1000XM5 Headphones at $399.99.

The current listed price is $349.99. That's a $50.00 difference within the 30-day price match window. Could you refund the difference to my original payment method?

Thanks,
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
    initialPart1: `I matched this against Best Buy's published Price Match Guarantee.`,
    initialPart2: `The current $349.99 is $50 less than what you paid, well within the 30-day window. Want me to soften the tone?`,
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
  headerStaggerDelay: 200,
  bodyTypeMs: 8,
  switchToAssistantAt: 5000,
  assistantTypeMs: 18,
  watchAgainDelay: 2800,
} as const;

const HEADER_BUTTON_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 },
  },
};

type Phase =
  | { kind: "idle" }
  | { kind: "playing-draft" }
  | { kind: "playing-assistant" }
  | { kind: "done-auto" }
  | { kind: "scripted-response"; action: QuickAction };

type AssistantStage = "none" | "part1" | "indicator" | "part2" | "done";

function useTypewriter(
  fullText: string,
  enabled: boolean,
  msPerChar: number,
): { text: string; done: boolean } {
  const [index, setIndex] = useState(0);

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
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [assistantHighlight, setAssistantHighlight] = useState(false);
  const [approveGlow, setApproveGlow] = useState(false);
  const [differenceDisplay, setDifferenceDisplay] = useState("0.00");
  const [assistantStage, setAssistantStage] = useState<AssistantStage>("none");
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
    setPhase({ kind: "idle" });
    setAssistantStage("none");

    if (reduceMotion) {
      setPhase({ kind: "done-auto" });
      setAssistantStage("done");
      setHasPlayedOnce(true);
      return;
    }

    timersRef.current.push(
      window.setTimeout(() => {
        setPhase({ kind: "playing-draft" });
      }, TIMING.startDelay),
    );
    timersRef.current.push(
      window.setTimeout(() => {
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

  useEffect(() => {
    if (reduceMotion) return;
    if (phase.kind === "playing-assistant" || phase.kind === "scripted-response") {
      setAssistantHighlight(true);
      const t = window.setTimeout(() => setAssistantHighlight(false), 700);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduceMotion]);

  useEffect(() => {
    if (phase.kind === "done-auto" && !reduceMotion) {
      setApproveGlow(true);
      const t = window.setTimeout(() => setApproveGlow(false), 2500);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduceMotion]);

  useEffect(() => {
    if (!inView || reduceMotion) {
      setDifferenceDisplay(DEMO.evidence.difference.toFixed(2));
      return;
    }
    const target = DEMO.evidence.difference;
    const startTime = performance.now();
    const duration = 1000;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDifferenceDisplay((target * eased).toFixed(2));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduceMotion]);

  useEffect(() => {
    if (phase.kind !== "playing-assistant") return;
    if (reduceMotion) {
      setAssistantStage("done");
      return;
    }
    setAssistantStage("part1");
  }, [phase, reduceMotion]);

  const draftPlaying = phase.kind === "playing-draft";
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

  const part1Enabled =
    assistantStage === "part1" ||
    assistantStage === "indicator" ||
    assistantStage === "part2" ||
    assistantStage === "done";

  const part2Enabled = assistantStage === "part2" || assistantStage === "done";

  const { text: part1Text, done: part1Done } = useTypewriter(
    DEMO.assistant.initialPart1,
    part1Enabled,
    TIMING.assistantTypeMs,
  );

  const { text: part2Text, done: part2Done } = useTypewriter(
    DEMO.assistant.initialPart2,
    part2Enabled,
    TIMING.assistantTypeMs,
  );

  const { text: assistantText, done: assistantDone } = useTypewriter(
    phase.kind === "scripted-response" ? SCRIPTED_RESPONSES[phase.action] : "",
    scriptedPlaying,
    TIMING.assistantTypeMs,
  );

  useEffect(() => {
    if (assistantStage !== "part1" || !part1Done) return;
    const t = window.setTimeout(() => setAssistantStage("indicator"), 200);
    return () => window.clearTimeout(t);
  }, [assistantStage, part1Done]);

  useEffect(() => {
    if (assistantStage !== "indicator") return;
    const t = window.setTimeout(() => setAssistantStage("part2"), 600);
    return () => window.clearTimeout(t);
  }, [assistantStage]);

  useEffect(() => {
    if (assistantStage !== "part2" || !part2Done) return;
    setAssistantStage("done");
  }, [assistantStage, part2Done]);

  useEffect(() => {
    if (phase.kind === "playing-assistant" && assistantStage === "done") {
      const t = window.setTimeout(() => {
        setPhase({ kind: "done-auto" });
        setHasPlayedOnce(true);
      }, TIMING.watchAgainDelay);
      return () => window.clearTimeout(t);
    }
  }, [phase, assistantStage]);

  const handleChipClick = (action: QuickAction) => {
    clearTimers();
    if (phase.kind === "playing-draft" || phase.kind === "playing-assistant") {
      setHasPlayedOnce(true);
    }
    setAssistantStage("none");
    setPhase({ kind: "scripted-response", action });
    setHasPlayedOnce(true);
  };

  const handleWatchAgain = () => {
    clearTimers();
    setPhase({ kind: "idle" });
    setHasPlayedOnce(false);
    setApproveGlow(false);
    setAssistantStage("none");
  };

  const draftDisplay = phase.kind === "idle" ? "" : draftPlaying ? draftText : DEMO.draft.body;

  const showDraftCursor = draftPlaying && !draftDone;

  return (
    <>
      <style>{`
        @keyframes s3-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .s3-cursor-blink {
          animation: s3-blink 1.1s steps(1, end) infinite;
        }
        @keyframes s3-approve-pulse {
          0% { box-shadow: 0 1px 2px rgba(24,95,165,0.25), 0 0 0 0 rgba(24,95,165,0.45); }
          50% { box-shadow: 0 1px 2px rgba(24,95,165,0.25), 0 0 0 6px rgba(24,95,165,0); }
          100% { box-shadow: 0 1px 2px rgba(24,95,165,0.25), 0 0 0 0 rgba(24,95,165,0); }
        }
        .s3-approve-glow {
          animation: s3-approve-pulse 1.4s cubic-bezier(0.16, 1, 0.3, 1) 1;
        }
        @keyframes s3-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .s3-shimmer::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: s3-shimmer 4s linear infinite;
          pointer-events: none;
        }
        @keyframes s3-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-2px); opacity: 1; }
        }
        .s3-typing-dot {
          animation: s3-typing-bounce 1s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .s3-cursor-blink, .s3-approve-glow {
            animation: none !important;
          }
          .s3-cursor-blink { opacity: 1; }
          .s3-shimmer::before { animation: none; }
          .s3-typing-dot { animation: none; opacity: 0.8; }
        }
      `}</style>

      <div className="mx-auto mt-10 max-w-6xl" ref={containerRef}>
        <p className="text-center text-sm text-neutral-500">See Step 3 in action</p>

        <div
          className={cn(
            "relative mt-6 overflow-hidden rounded-2xl",
            "border border-neutral-200/60",
            "shadow-neutral-900/[0.06] shadow-xl ring-1 ring-neutral-900/[0.03]",
            "dark:border-white/10",
            "dark:shadow-[0_0_60px_rgba(255,255,255,0.06)]",
            "dark:ring-1 dark:ring-white/10",
          )}
          style={{
            backgroundImage: `
              radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.04) 1px, transparent 0)
            `,
            backgroundSize: "24px 24px",
            backgroundColor: "var(--color-neutral-0, white)",
          }}
        >
          {/* Mini ClaimHeader */}
          <div className="border-neutral-200/60 border-b bg-neutral-0/80 px-6 py-3 backdrop-blur-sm sm:px-8 sm:py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="inline-flex min-w-0 items-center gap-1 text-neutral-500 text-xs">
                <ArrowLeft className="h-3 w-3 shrink-0" aria-hidden />
                <span className="shrink-0">Claims</span>
                <span className="text-neutral-300">/</span>
                <span className="truncate font-medium text-neutral-700">{DEMO.title}</span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 font-medium text-neutral-600 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-semantic-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-semantic-success" />
                </span>
                Live
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-md bg-brand-primary-50 px-2 py-0.5 font-medium text-[11px] text-brand-primary-500 ring-1 ring-brand-primary-500/20">
                  {DEMO.status.label}
                </span>
                <span className="text-neutral-600 text-sm">{DEMO.platform}</span>
                <span className="text-neutral-300">·</span>
                <span className="font-semibold text-neutral-900 text-sm tabular-nums">
                  ${DEMO.refundAmount.toFixed(2)}
                </span>
                <span className="text-neutral-300">·</span>
                <span className="inline-flex items-center gap-1 font-medium text-semantic-warning text-sm">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {DEMO.daysRemaining} days remaining
                </span>
              </div>

              <motion.div
                className="flex items-center gap-2"
                initial={reduceMotion ? false : "hidden"}
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.06,
                      delayChildren: TIMING.headerStaggerDelay / 1000,
                    },
                  },
                }}
              >
                <motion.button
                  variants={HEADER_BUTTON_VARIANTS}
                  type="button"
                  tabIndex={-1}
                  aria-disabled
                  className="inline-flex cursor-default items-center gap-1 rounded-md border border-neutral-200/80 bg-transparent px-2.5 py-1 font-medium text-neutral-700 text-xs transition-all hover:bg-neutral-50"
                >
                  <Edit className="h-3 w-3" aria-hidden />
                  Edit draft
                </motion.button>
                <motion.button
                  variants={HEADER_BUTTON_VARIANTS}
                  type="button"
                  tabIndex={-1}
                  aria-disabled
                  className="inline-flex cursor-default items-center gap-1 rounded-md border border-neutral-200/80 bg-transparent px-2.5 py-1 font-medium text-semantic-danger text-xs transition-all hover:bg-semantic-danger/5"
                >
                  <XCircle className="h-3 w-3" aria-hidden />
                  Cancel claim
                </motion.button>
                <motion.button
                  variants={HEADER_BUTTON_VARIANTS}
                  type="button"
                  tabIndex={-1}
                  aria-disabled
                  className={cn(
                    "inline-flex cursor-default items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium text-neutral-0 text-sm",
                    "bg-gradient-to-b from-brand-primary-500 to-brand-primary-600",
                    "shadow-brand-primary-500/30 shadow-sm transition-all hover:scale-[1.02]",
                    approveGlow && "s3-approve-glow",
                  )}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Approve and send
                </motion.button>
              </motion.div>
            </div>
          </div>

          <div className="grid gap-5 bg-neutral-50/40 px-6 pt-4 pb-6 sm:px-8 sm:pt-5 sm:pb-8 lg:grid-cols-[3fr_2fr] lg:items-stretch">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200/60 bg-neutral-0 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 border-neutral-200/60 border-b px-4 py-2.5">
                <Mail className="h-[15px] w-[15px] text-neutral-500" aria-hidden />
                <span className="font-semibold text-[14px] text-neutral-900 tracking-tight">
                  Email Draft
                </span>
              </div>
              <div className="border-neutral-200/60 border-b px-4 py-2">
                <span className="text-neutral-500 text-xs">
                  {DEMO.draft.version} · {DEMO.draft.source} · {DEMO.draft.when}
                </span>
              </div>
              <div className="border-neutral-200/60 border-b px-4 py-1.5">
                <div className="inline-flex items-center rounded-md bg-neutral-100 p-0.5 text-[11px]">
                  <span className="rounded-[5px] bg-neutral-0 px-2 py-0.5 font-medium text-neutral-900 shadow-sm">
                    Preview
                  </span>
                  <span className="px-2 py-0.5 text-neutral-500">Edit</span>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <div className="space-y-1.5 rounded-lg border border-neutral-200/60 bg-neutral-50 p-3 text-xs">
                  <div className="flex">
                    <span className="mt-0.5 w-16 shrink-0 font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
                      Subject
                    </span>
                    <span className="text-neutral-900">{DEMO.draft.subject}</span>
                  </div>
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200/60 bg-neutral-0 p-3">
                  <div className="flex-1 whitespace-pre-wrap text-neutral-700 text-xs leading-relaxed">
                    {draftDisplay}
                    {showDraftCursor ? (
                      <span className="s3-cursor-blink ml-px inline-block h-[12px] w-[2px] bg-neutral-700 align-middle" />
                    ) : null}
                  </div>
                  <div className="pointer-events-none absolute inset-x-3 bottom-10 h-12 bg-gradient-to-t from-neutral-0 to-neutral-0/0" />
                  <div className="relative mt-2 flex items-center justify-between border-neutral-100 border-t pt-2 text-[10px] text-neutral-400">
                    <span>Showing first 3 paragraphs</span>
                    <span className="inline-flex items-center gap-0.5 text-brand-primary-500">
                      Open in app for full draft
                      <ArrowRight className="h-2.5 w-2.5" aria-hidden />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-5">
              <div className="overflow-hidden rounded-lg border border-neutral-200/60 bg-neutral-0 transition-shadow hover:shadow-md">
                <div className="flex items-center gap-2 border-neutral-200/60 border-b px-4 py-2.5">
                  <FileText className="h-[15px] w-[15px] text-neutral-500" aria-hidden />
                  <span className="font-semibold text-[14px] text-neutral-900 tracking-tight">
                    Evidence
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <Card className="border-neutral-200/60">
                    <CardContent className="p-4">
                      <div className="mb-2 font-medium text-[10px] text-neutral-400 uppercase tracking-wider">
                        Current price
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="font-bold text-3xl text-neutral-900 tabular-nums leading-none">
                            ${DEMO.evidence.currentPrice.toFixed(2)}
                          </div>
                          <div className="mt-1.5 text-[11px] text-neutral-500 tabular-nums">
                            from{" "}
                            <span className="line-through">
                              ${DEMO.evidence.originalPrice.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-[5.5rem] text-right">
                          <div className="font-bold text-semantic-success text-xl tabular-nums leading-none">
                            -${differenceDisplay}
                          </div>
                          <div className="mt-1.5 text-[11px] text-neutral-500">you saved</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="s3-shimmer relative overflow-hidden rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-md ring-1 ring-white/10">
                    <div className="flex items-center gap-1.5 border-white/5 border-b px-2.5 py-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-500/50" />
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500/50" />
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500/50" />
                      <div className="ml-2 font-mono text-[9px] text-neutral-500">
                        bestbuy.com/sony-wh1000xm5
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="space-y-1">
                        <div className="h-1.5 w-3/5 rounded bg-neutral-700" />
                        <div className="h-1.5 w-2/5 rounded bg-neutral-700/60" />
                      </div>
                      <div className="flex items-baseline gap-2 pt-1">
                        <span className="font-mono text-[9px] text-neutral-500 line-through">
                          $399.99
                        </span>
                        <span className="font-bold font-mono text-neutral-100 text-sm">
                          $349.99
                        </span>
                        <span className="font-medium font-mono text-[10px] text-semantic-success">
                          −$50.00
                        </span>
                      </div>
                      <div className="space-y-1 pt-1">
                        <div className="h-1 w-4/5 rounded bg-neutral-700/40" />
                        <div className="h-1 w-3/4 rounded bg-neutral-700/40" />
                      </div>
                    </div>
                    <div className="border-white/5 border-t px-3 py-1.5">
                      <div className="font-mono text-[9px] text-neutral-400">
                        Captured 2026-05-29 11:34 UTC
                      </div>
                      <div className="mt-0.5 text-[9px] text-neutral-500">
                        by ClaimIt monitor-agent
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 font-mono text-[10px] text-neutral-500">
                    <span>
                      Source:{" "}
                      <span className="font-medium text-brand-primary-500">
                        {DEMO.evidence.source}
                      </span>
                    </span>
                    <span>{DEMO.evidence.captured}</span>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "flex h-[320px] min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200/60 bg-neutral-0 transition-all hover:shadow-md",
                  assistantHighlight && "ring-2 ring-brand-primary-300",
                )}
              >
                <div className="flex items-center gap-2 border-neutral-200/60 border-b px-4 py-2.5">
                  <Sparkles className="h-[15px] w-[15px] text-neutral-500" aria-hidden />
                  <span className="font-semibold text-[14px] text-neutral-900 tracking-tight">
                    Assistant
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500">
                      <span className="inline-block h-1 w-1 rounded-full bg-semantic-success" />
                      95% policy match
                    </span>
                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                      Claim-focused
                    </span>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden px-4 pt-4 pb-2">
                  {(assistantStage === "part1" ||
                    assistantStage === "indicator" ||
                    assistantStage === "part2" ||
                    assistantStage === "done") &&
                    phase.kind !== "scripted-response" && (
                      <div className="flex items-start gap-2">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                          <Sparkles className="h-2.5 w-2.5 text-neutral-500" aria-hidden />
                        </div>
                        <div className="max-w-[88%] rounded-2xl bg-neutral-100 px-3 py-2 text-neutral-900 text-xs leading-relaxed">
                          {assistantStage === "done" ? DEMO.assistant.initialPart1 : part1Text}
                          {assistantStage === "part1" && !part1Done ? (
                            <span className="s3-cursor-blink ml-px inline-block h-[10px] w-[2px] bg-neutral-700 align-middle" />
                          ) : null}
                        </div>
                      </div>
                    )}

                  {assistantStage === "indicator" && (
                    <div className="flex items-start gap-2 pl-7">
                      <div className="inline-flex gap-1 rounded-2xl bg-neutral-100 px-3 py-2.5">
                        <span
                          className="s3-typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="s3-typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="s3-typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    </div>
                  )}

                  {(assistantStage === "part2" || assistantStage === "done") &&
                    phase.kind !== "scripted-response" && (
                      <div className="flex items-start gap-2">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                          <Sparkles className="h-2.5 w-2.5 text-neutral-500" aria-hidden />
                        </div>
                        <div className="max-w-[88%] rounded-2xl bg-neutral-100 px-3 py-2 text-neutral-900 text-xs leading-relaxed">
                          {assistantStage === "done" ? DEMO.assistant.initialPart2 : part2Text}
                          {assistantStage === "part2" && !part2Done ? (
                            <span className="s3-cursor-blink ml-px inline-block h-[10px] w-[2px] bg-neutral-700 align-middle" />
                          ) : null}
                        </div>
                      </div>
                    )}

                  {phase.kind === "scripted-response" && (
                    <>
                      <div className="flex items-start justify-end gap-2">
                        <div className="max-w-[80%] rounded-2xl bg-brand-primary-500 px-3 py-2 text-neutral-0 text-xs">
                          {phase.action}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                          <Sparkles className="h-2.5 w-2.5 text-neutral-500" aria-hidden />
                        </div>
                        <div className="max-w-[88%] rounded-2xl bg-neutral-100 px-3 py-2 text-neutral-900 text-xs leading-relaxed">
                          {assistantText}
                          {scriptedPlaying && !assistantDone ? (
                            <span className="s3-cursor-blink ml-px inline-block h-[10px] w-[2px] bg-neutral-700 align-middle" />
                          ) : null}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5 border-neutral-200/60 border-t px-4 py-3">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => handleChipClick(action)}
                      className="truncate rounded-full border border-neutral-200/80 bg-neutral-0 px-3 py-1.5 text-center font-medium text-[11px] text-neutral-700 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-sm"
                      style={{
                        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                        transitionDuration: "200ms",
                      }}
                    >
                      {action}
                    </button>
                  ))}
                </div>

                <div className="border-neutral-200/60 border-t bg-neutral-50/40 p-3">
                  <div className="flex items-center gap-2 rounded-lg border border-neutral-200/80 bg-neutral-0 px-3 py-2 transition-all hover:border-brand-primary-300 hover:ring-2 hover:ring-brand-primary-100">
                    <span className="flex-1 text-neutral-400 text-xs">Ask about this claim…</span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-disabled
                      className="cursor-default rounded-md bg-neutral-100 p-1 text-neutral-400"
                    >
                      <Send className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
    </>
  );
}
