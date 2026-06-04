// ─────────────────────────────────────────────────────────────────────────
// Claim-detail 3-pane shell — rebuild of apps/web ClaimDetailShell +
// {claim-header, draft-pane, evidence-pane, assistant-pane, post-approve-banner}.
// Direct import is impossible (zustand stores, react-resizable-panels, SSE
// hooks, next/link) so the visual is rebuilt with verbatim apps/web classes.
// Layout = resizable-panels defaults: Draft 40% | (Evidence 60% / Assistant 40%).
// ─────────────────────────────────────────────────────────────────────────
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit,
  ExternalLink,
  FileText,
  Mail,
  Maximize2,
  Receipt,
  Send,
  Sparkles,
  TrendingDown,
  User,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { COSTCO } from "./_data";
import { Badge, Btn, Card, CardContent, CardHeader, CardTitle, cn } from "./_ui";

export type ClaimStatus = "awaiting_approval" | "submitted";
type Version = { n: number; label: string; content: string };
type Msg = { role: "user" | "assistant"; text: ReactNode; tool?: string; trace?: boolean };

// Minimal **bold** markdown → JSX (assistant bubble).
export function md(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: static segmented string
      <strong key={i} className="font-semibold">
        {seg.slice(2, -2)}
      </strong>
    ) : (
      seg
    ),
  );
}

function PaneHeader({ icon, title, badge }: { icon: ReactNode; title: string; badge?: ReactNode }) {
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3 text-left",
        badge ? "justify-between" : "",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-medium text-neutral-900 text-sm">{title}</h3>
      </div>
      {badge ?? <Maximize2 className="ml-auto h-3.5 w-3.5 text-neutral-400 opacity-0" />}
    </div>
  );
}

// ── Draft pane ─────────────────────────────────────────────────────────────
function DraftPaneView({ versions, selected }: { versions: Version[]; selected: number }) {
  const v = versions.find((x) => x.n === selected) ?? versions[versions.length - 1];
  const total = versions.length;
  const when = v.n === 1 ? "5 minutes ago" : "1 minute ago";
  const versionText = `v${v.n}${total > 1 ? ` of ${total}` : ""} · ${v.label} · ${when}`;
  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader icon={<Mail className="h-4 w-4 text-neutral-500" />} title="Email Draft" />
      <div className="flex items-center justify-between border-neutral-200 border-b px-4 py-2">
        <span className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium text-neutral-700 text-sm">
          {versionText}
          <ChevronDown className="h-4 w-4" />
        </span>
      </div>
      <div className="border-neutral-200 border-b px-4">
        <div className="inline-flex h-10 w-fit items-center justify-center gap-1 rounded-lg p-[3px]">
          <span className="relative inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent bg-background px-1.5 py-0.5 text-sm font-medium text-foreground shadow-sm">
            Preview
          </span>
          <span className="relative inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium text-foreground/60">
            Edit
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-16 font-medium text-neutral-500">Subject:</span>
              <span className="text-neutral-900">{COSTCO.subject}</span>
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4">
            <div className="whitespace-pre-wrap text-neutral-700 text-sm leading-relaxed">
              {v.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Evidence pane ────────────────────────────────────────────────────────────
function EvidenceScreenshot() {
  // Representative price-drop screenshot (the real EvidencePane fetches a blob
  // via the api-gateway proxy; not available in a static render).
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
      <div className="flex items-center gap-1.5 border-neutral-100 border-b bg-neutral-50 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-neutral-300" />
        <span className="h-2 w-2 rounded-full bg-neutral-300" />
        <span className="h-2 w-2 rounded-full bg-neutral-300" />
        <span className="ml-2 text-[10px] text-neutral-400">costco.com</span>
      </div>
      <div className="flex h-24 items-center justify-between px-4">
        <div className="min-w-0">
          <div className="truncate text-neutral-700 text-xs">Apple iPad Air 11" (M2, 128GB)</div>
          <div className="mt-1 text-neutral-400 text-[10px] line-through tabular-nums">$599.99</div>
          <div className="font-semibold text-neutral-900 text-lg tabular-nums">$499.99</div>
        </div>
        <div className="rounded-md bg-semantic-warning-bg px-2 py-1 text-[10px] font-medium text-semantic-warning">
          Price drop
        </div>
      </div>
    </div>
  );
}

function EvidencePaneView() {
  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader icon={<FileText className="h-4 w-4 text-neutral-500" />} title="Evidence" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <TrendingDown className="h-4 w-4 text-semantic-warning" />
                Current price
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div className="space-y-1">
                  <div className="text-neutral-500 text-sm tabular-nums">Original: $599.99</div>
                  <div className="font-semibold text-2xl text-neutral-900 tabular-nums">$499.99</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-lg text-semantic-warning tabular-nums">-$100.00</div>
                  <div className="text-neutral-500 text-xs">difference</div>
                </div>
              </div>
              <EvidenceScreenshot />
              <div className="flex items-center justify-between text-neutral-500 text-xs">
                <span>
                  Source: <span className="text-brand-primary-500">Costco</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {COSTCO.capturedAtLong}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <FileText className="h-4 w-4" />
                Costco price match policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <blockquote className="rounded-r-md border-semantic-warning border-l-4 bg-semantic-warning-bg/30 px-3 py-2 text-neutral-700 text-sm italic">
                {COSTCO.policyClause}
              </blockquote>
              <a className="inline-flex items-center gap-1 font-medium text-brand-primary-500 text-sm">
                Read Costco policy
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="text-neutral-500 text-xs">Policy verified {COSTCO.policyVerifiedLong}</p>
            </CardContent>
          </Card>

          <Card className="border-neutral-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
                <Receipt className="h-4 w-4" />
                Your original purchase
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50">
                <div className="text-center">
                  <Receipt className="mx-auto h-6 w-6 text-neutral-400" />
                  <span className="mt-1 text-neutral-400 text-xs">Receipt</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Purchase date</span>
                  <span className="text-neutral-900">{COSTCO.purchaseDateLong}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Order ID</span>
                  <span className="font-mono text-neutral-900">{COSTCO.orderId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Price paid</span>
                  <span className="font-medium text-neutral-900">$599.99</span>
                </div>
              </div>
              <a className="inline-flex items-center gap-1 font-medium text-brand-primary-500 text-sm">
                View purchase
                <ArrowRight className="h-4 w-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Assistant pane ───────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  "Make it friendlier",
  "Why this template?",
  "Explain the policy match",
  "Switch to manual approval",
];

function Bubble({ msg }: { msg: Msg }) {
  const isAssistant = msg.role === "assistant";
  return (
    <div className={cn("flex gap-3", isAssistant ? "justify-start" : "justify-end")}>
      {isAssistant ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
          <Bot className="h-4 w-4 text-neutral-600" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[70%] rounded-lg px-4 py-2.5",
          isAssistant ? "bg-neutral-100 text-neutral-900" : "bg-brand-primary-500 text-neutral-0",
        )}
      >
        {isAssistant ? (
          <div className="text-sm leading-relaxed">{msg.text}</div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
        )}
        {msg.tool ? (
          <Badge variant="secondary" className="mt-2 text-neutral-500 text-xs">
            Tools · {msg.tool}
          </Badge>
        ) : null}
        {msg.trace ? (
          <a className="mt-1.5 inline-flex items-center gap-1 text-neutral-400 text-xs">
            <ExternalLink className="h-3 w-3" />
            View trace
          </a>
        ) : null}
      </div>
      {!isAssistant ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary-500">
          <User className="h-4 w-4 text-neutral-0" />
        </div>
      ) : null}
    </div>
  );
}

function AssistantPaneView({ messages }: { messages: Msg[] }) {
  return (
    <div className="flex h-full flex-col bg-neutral-0">
      <PaneHeader
        icon={<Sparkles className="h-4 w-4 text-brand-primary-500" />}
        title="Assistant"
        badge={
          <Badge variant="secondary" className="bg-brand-primary-50 text-brand-primary-500 text-xs">
            🎯 Claim-focused
          </Badge>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Ask about this claim — try a quick action below or type your own question.
          </p>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static fixed list
              <Bubble key={i} msg={m} />
            ))}
          </div>
        )}
      </div>
      <div className="border-neutral-200 border-t px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <span
              key={a}
              className="rounded-full border border-neutral-200 bg-neutral-0 px-3 py-1 text-neutral-700 text-xs"
            >
              {a}
            </span>
          ))}
        </div>
      </div>
      <div className="border-neutral-200 border-t p-4">
        <div className="flex items-end gap-2">
          <div className="flex min-h-10 w-full items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm text-neutral-400">
            Ask about this claim...
          </div>
          <Btn size="icon" className="shrink-0">
            <Send className="h-4 w-4" />
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Header + banner ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ClaimStatus }) {
  if (status === "submitted") {
    return (
      <Badge variant="outline" className="font-medium bg-neutral-100 text-neutral-700 border-neutral-200">
        Submitted
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="font-medium bg-brand-primary-50 text-brand-primary-500 border-brand-primary-500/20"
    >
      Awaiting Approval
    </Badge>
  );
}

function ClaimHeaderBar({ status }: { status: ClaimStatus }) {
  return (
    <div className="sticky top-0 z-10 border-neutral-200 border-b bg-neutral-0 px-6 py-3">
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <ArrowLeft className="h-4 w-4 text-neutral-600" />
          </span>
          <nav className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-neutral-500">Claims</span>
            <span className="shrink-0 text-neutral-300">/</span>
            <span className="truncate font-medium text-neutral-900">{COSTCO.productName}</span>
          </nav>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge status={status} />
            <div className="flex flex-wrap items-center gap-2 text-neutral-500 text-sm">
              <span>Costco</span>
              <span>·</span>
              <span className="font-medium text-neutral-700">$100.00</span>
              <span>·</span>
              <span className="flex items-center gap-1 text-semantic-warning">
                <Clock className="h-4 w-4" />
                {COSTCO.windowRemaining}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status === "awaiting_approval" ? (
              <>
                <Btn variant="ghost" size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit draft
                </Btn>
                <Btn variant="ghost" size="sm" className="text-semantic-danger">
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel claim
                </Btn>
                <Btn size="sm">
                  <Send className="mr-2 h-4 w-4" />
                  Approve and send
                </Btn>
              </>
            ) : (
              <>
                <Btn size="sm">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approved / refunded
                </Btn>
                <Btn variant="destructiveSolid" size="sm">
                  <XCircle className="mr-2 h-4 w-4" />
                  Denied
                </Btn>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostApproveBannerView() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-neutral-200 border-b bg-brand-primary-50 px-6 py-2 text-brand-primary-500 text-sm">
      <Mail className="h-4 w-4" />
      <span>
        <strong className="font-medium">Submitted</strong> — sending from your Gmail.
      </span>
    </div>
  );
}

// ── Shell frame ──────────────────────────────────────────────────────────────
export function ClaimShellFrame({
  status,
  versions,
  selected,
  messages,
}: {
  status: ClaimStatus;
  versions: Version[];
  selected: number;
  messages: Msg[];
}) {
  return (
    <div className="flex h-full flex-col">
      <ClaimHeaderBar status={status} />
      {status === "submitted" ? <PostApproveBannerView /> : null}
      <div className="min-h-0 flex-1 overflow-hidden bg-neutral-50">
        <div className="flex h-full">
          <div className="border-neutral-200 border-r" style={{ width: "40%" }}>
            <DraftPaneView versions={versions} selected={selected} />
          </div>
          <div className="flex flex-col" style={{ width: "60%" }}>
            <div className="border-neutral-200 border-b" style={{ height: "60%" }}>
              <EvidencePaneView />
            </div>
            <div style={{ height: "40%" }}>
              <AssistantPaneView messages={messages} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { Msg, Version };
