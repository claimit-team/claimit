"use client";

import {
  ArrowRight,
  Clock,
  Edit,
  FileText,
  Image as ImageIcon,
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
    subject: "Price match refund — Order demo-ord-e273a5c7b4",
    body: `Hello Best Buy Customer Care,

I'm writing to request a price match refund on a recent purchase. Order demo-ord-e273a5c7b4 — Sony WH-1000XM5 Headphones at $399.99.

The current price is $349.99 — a $50.00 difference, within the 30-day price match window.`,
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

    if (reduceMotion) {
      setPhase({ kind: "done-auto" });
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
    if (phase.kind === "playing-draft" || phase.kind === "playing-assistant") {
      setHasPlayedOnce(true);
    }
    setPhase({ kind: "scripted-response", action });
    setHasPlayedOnce(true);
  };

  const handleWatchAgain = () => {
    clearTimers();
    setPhase({ kind: "idle" });
    setHasPlayedOnce(false);
    setApproveGlow(false);
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
        @media (prefers-reduced-motion: reduce) {
          .s3-cursor-blink, .s3-approve-glow {
            animation: none !important;
          }
          .s3-cursor-blink { opacity: 1; }
          .s3-shimmer::before { animation: none; }
        }
      `}</style>

      <div className="mx-auto mt-10 max-w-6xl" ref={containerRef}>
        <p className="text-center text-sm text-neutral-500">See Step 3 in action</p>

        <div className="relative mt-4 overflow-hidden rounded-2xl border border-neutral-200/80 bg-gradient-to-b from-neutral-0 to-neutral-50/40 shadow-neutral-900/[0.06] shadow-xl ring-1 ring-neutral-900/[0.03]">
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-0/90 px-2 py-1 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-semantic-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-semantic-success" />
            </span>
            <span className="font-medium text-[10px] text-neutral-700">Live demo</span>
          </div>

          <div className="border-neutral-200 border-b bg-neutral-0 px-4 py-3 sm:px-6">
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

            <motion.div
              className="mt-3 flex flex-wrap gap-1.5"
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
                className="inline-flex cursor-default items-center gap-1 rounded-md border border-neutral-200 bg-transparent px-2.5 py-1 font-medium text-neutral-700 text-xs transition-all hover:bg-neutral-50"
                tabIndex={-1}
                aria-disabled
              >
                <Edit className="h-3 w-3" aria-hidden />
                Edit draft
              </motion.button>
              <motion.button
                variants={HEADER_BUTTON_VARIANTS}
                type="button"
                className="inline-flex cursor-default items-center gap-1 rounded-md border border-neutral-200 bg-transparent px-2.5 py-1 font-medium text-semantic-danger text-xs transition-all hover:bg-neutral-50"
                tabIndex={-1}
                aria-disabled
              >
                <XCircle className="h-3 w-3" aria-hidden />
                Cancel claim
              </motion.button>
              <motion.button
                variants={HEADER_BUTTON_VARIANTS}
                type="button"
                className={cn(
                  "inline-flex cursor-default items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium text-neutral-0 text-sm",
                  "bg-gradient-to-b from-brand-primary-500 to-brand-primary-600",
                  "shadow-brand-primary-500/30 shadow-sm transition-all",
                  approveGlow && "s3-approve-glow",
                )}
                tabIndex={-1}
                aria-disabled
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Approve and send
              </motion.button>
            </motion.div>
          </div>

          <div className="grid gap-4 bg-neutral-50 p-4 sm:p-6 lg:grid-cols-[3fr_2fr]">
            <div className="min-h-[440px] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 border-neutral-200 border-b px-4 py-2.5">
                <Mail className="h-4 w-4 text-neutral-500" aria-hidden />
                <span className="font-medium text-neutral-900 text-sm">Email Draft</span>
              </div>
              <div className="border-neutral-200 border-b px-4 py-2">
                <span className="text-neutral-500 text-xs">
                  {DEMO.draft.version} · {DEMO.draft.source} · {DEMO.draft.when}
                </span>
              </div>
              <div className="border-neutral-200 border-b px-4 py-1.5">
                <div className="inline-flex items-center rounded-md bg-neutral-100 p-0.5 text-[11px]">
                  <span className="rounded-[5px] bg-neutral-0 px-2 py-0.5 font-medium text-neutral-900 shadow-sm">
                    Preview
                  </span>
                  <span className="px-2 py-0.5 text-neutral-500">Edit</span>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
                  <div className="flex">
                    <span className="w-16 shrink-0 text-neutral-500">Subject:</span>
                    <span className="text-neutral-900">{DEMO.draft.subject}</span>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 p-3">
                  <div className="min-h-[200px] whitespace-pre-wrap text-neutral-700 text-xs leading-relaxed">
                    {draftDisplay}
                    {showDraftCursor ? (
                      <span className="s3-cursor-blink ml-px inline-block h-[12px] w-[2px] bg-neutral-700 align-middle" />
                    ) : null}
                  </div>
                  <div className="pointer-events-none absolute inset-x-3 bottom-0 h-12 bg-gradient-to-t from-neutral-0 to-neutral-0/0" />
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

            <div className="grid gap-4 lg:auto-rows-fr">
              <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 transition-shadow hover:shadow-md">
                <div className="flex items-center gap-2 border-neutral-200 border-b px-4 py-2.5">
                  <FileText className="h-4 w-4 text-neutral-500" aria-hidden />
                  <span className="font-medium text-neutral-900 text-sm">Evidence</span>
                </div>
                <div className="space-y-3 p-4">
                  <Card className="border-neutral-200">
                    <CardContent className="pt-4">
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <div className="font-medium text-[10px] text-neutral-400 uppercase tracking-wider">
                            Current price
                          </div>
                          <div className="mt-1 font-bold text-3xl text-neutral-900 tabular-nums leading-none">
                            ${DEMO.evidence.currentPrice.toFixed(2)}
                          </div>
                          <div className="mt-1 text-[11px] text-neutral-500 tabular-nums">
                            from{" "}
                            <span className="line-through">
                              ${DEMO.evidence.originalPrice.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-[5.5rem] text-right">
                          <div className="flex items-baseline justify-end gap-0.5">
                            <span
                              className="font-bold text-semantic-success text-xl tabular-nums"
                              style={{ color: "var(--color-semantic-success, #15803d)" }}
                            >
                              -$
                              <motion.span>{differenceDisplay}</motion.span>
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-neutral-500">you saved</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <div className="s3-shimmer relative h-[110px] overflow-hidden rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-md ring-1 ring-white/10">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-1.5 text-neutral-500">
                        <ImageIcon className="h-7 w-7" aria-hidden />
                        <span className="text-[10px] text-neutral-400 tracking-wide">
                          RECEIPT.PNG
                        </span>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-900 to-transparent p-2">
                      <div className="text-[10px] text-neutral-300 leading-relaxed">
                        Captured 2026-05-29 11:34 UTC
                      </div>
                      <div className="text-[10px] text-neutral-400 leading-relaxed">
                        Price drop detected by ClaimIt monitor-agent
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[10px] text-neutral-500">
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
                  "overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 transition-all hover:shadow-md",
                  assistantHighlight && "ring-2 ring-brand-primary-300",
                )}
              >
                <div className="flex items-center gap-2 border-neutral-200 border-b px-4 py-2.5">
                  <Sparkles className="h-4 w-4 text-neutral-500" aria-hidden />
                  <span className="font-medium text-neutral-900 text-sm">Assistant</span>
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
                <div className="flex flex-col space-y-3 p-4">
                  <div className="min-h-[120px] space-y-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                        <Sparkles className="h-2.5 w-2.5 text-neutral-500" aria-hidden />
                      </div>
                      <div className="max-w-[88%] rounded-lg bg-neutral-100 px-2.5 py-1.5 text-neutral-900 text-xs leading-relaxed">
                        {assistantDisplay}
                        {showAssistantCursor ? (
                          <span className="s3-cursor-blink ml-px inline-block h-[10px] w-[2px] bg-neutral-700 align-middle" />
                        ) : null}
                      </div>
                    </div>
                    {phase.kind === "scripted-response" ? (
                      <div className="flex items-start justify-end gap-2">
                        <div className="max-w-[80%] rounded-lg bg-brand-primary-500 px-2.5 py-1.5 text-neutral-0 text-xs">
                          {phase.action}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 border-neutral-200 border-t pt-3">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => handleChipClick(action)}
                        className="rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-[11px] text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-100 hover:shadow-sm"
                        style={{
                          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                          transitionDuration: "200ms",
                        }}
                      >
                        {action}
                      </button>
                    ))}
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
