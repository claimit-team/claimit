// Clean (no AppShell) 3-pane ClaimShell for Beat08 — faithful rebuild of the
// uiref ClaimShellFrame (uirefs/_claim.tsx) panes, but controllable per-frame:
//   • per-pane BLUR (focus walk) · draft TYPEWRITER + v1→v2 redraft
//   • live chat INPUT typing · assistant thread appearing · approve state
// The locked uiref is NOT modified — classes are copied to a beat-local variant.
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Clock,
  Edit,
  ExternalLink,
  FileText,
  Mail,
  Receipt,
  Send,
  Sparkles,
  TrendingDown,
  User,
  XCircle,
} from "lucide-react";

import { COSTCO } from "../../uirefs/_data";
import { Badge, Btn, Card, CardContent, CardHeader, CardTitle, cn } from "../../uirefs/_ui";

export type Focus = { draft: number; evidence: number; assistant: number };
export type ChatMsg = { role: "user" | "assistant"; text: string; caret?: boolean; tool?: string };

const CARET = <span style={{ color: "#27466E", fontWeight: 400 }}>▏</span>;

// NB: do NOT set height here — the pane wrappers set their own (40% / 60% / 40%);
// a height here would override the flex split and collapse the Assistant pane.
const paneStyle = (f: number): React.CSSProperties => ({
  filter: `blur(${((1 - f) * 6.5).toFixed(2)}px)`,
  opacity: 0.5 + 0.5 * f,
  overflow: "hidden",
});

// ── Draft pane ───────────────────────────────────────────────────────────────
const DraftPane: React.FC<{
  text: string;
  caret: boolean;
  versionLabel: string;
  bodyOpacity: number;
}> = ({ text, caret, versionLabel, bodyOpacity }) => (
  <div className="flex h-full flex-col bg-neutral-0">
    <div className="flex w-full items-center gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3">
      <Mail className="h-4 w-4 text-neutral-500" />
      <h3 className="font-medium text-neutral-900 text-sm">Email Draft</h3>
    </div>
    <div className="flex items-center justify-between border-neutral-200 border-b px-4 py-2">
      <span className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium text-neutral-700 text-sm">
        {versionLabel}
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
        <div
          className="rounded-lg border border-neutral-200 bg-neutral-0 p-4"
          style={{ opacity: bodyOpacity }}
        >
          <div className="whitespace-pre-wrap text-neutral-700 text-sm leading-relaxed">
            {text}
            {caret ? CARET : null}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── Evidence pane (static, faithful) ──────────────────────────────────────────
const EvidencePane: React.FC = () => (
  <div className="flex h-full flex-col bg-neutral-0">
    <div className="flex w-full items-center gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3">
      <FileText className="h-4 w-4 text-neutral-500" />
      <h3 className="font-medium text-neutral-900 text-sm">Evidence</h3>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-4 p-4">
        <Card className="border-neutral-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
              <TrendingDown className="h-4 w-4 text-semantic-warning" /> Current price
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div className="space-y-1">
                <div className="text-neutral-500 text-sm tabular-nums">Original: $599.99</div>
                <div className="font-semibold text-2xl text-neutral-900 tabular-nums">$499.99</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-lg text-semantic-warning tabular-nums">
                  -$100.00
                </div>
                <div className="text-neutral-500 text-xs">difference</div>
              </div>
            </div>
            <div className="relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
              <div className="flex items-center gap-1.5 border-neutral-100 border-b bg-neutral-50 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="h-2 w-2 rounded-full bg-neutral-300" />
                <span className="ml-2 text-[10px] text-neutral-400">costco.com</span>
              </div>
              <div className="flex h-24 items-center justify-between px-4">
                <div className="min-w-0">
                  <div className="truncate text-neutral-700 text-xs">
                    Apple iPad Air 11" (M2, 128GB)
                  </div>
                  <div className="mt-1 text-neutral-400 text-[10px] line-through tabular-nums">
                    $599.99
                  </div>
                  <div className="font-semibold text-neutral-900 text-lg tabular-nums">$499.99</div>
                </div>
                <div className="rounded-md bg-semantic-warning-bg px-2 py-1 text-[10px] font-medium text-semantic-warning">
                  Price drop
                </div>
              </div>
            </div>
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
              <FileText className="h-4 w-4" /> Costco price match policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <blockquote className="rounded-r-md border-semantic-warning border-l-4 bg-semantic-warning-bg/30 px-3 py-2 text-neutral-700 text-sm italic">
              {COSTCO.policyClause}
            </blockquote>
            <span className="inline-flex items-center gap-1 font-medium text-brand-primary-500 text-sm">
              Read Costco policy <ExternalLink className="h-3 w-3" />
            </span>
            <p className="text-neutral-500 text-xs">Policy verified {COSTCO.policyVerifiedLong}</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-medium text-neutral-700 text-sm">
              <Receipt className="h-4 w-4" /> Your original purchase
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Order ID</span>
              <span className="font-mono text-neutral-900">{COSTCO.orderId}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Price paid</span>
              <span className="font-medium text-neutral-900">$599.99</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
);

// ── Assistant pane ─────────────────────────────────────────────────────────────
const QUICK_ACTIONS = ["Make it friendlier", "Why this template?", "Explain the policy match"];

const Bubble: React.FC<{ msg: ChatMsg }> = ({ msg }) => {
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
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {msg.text}
          {msg.caret ? CARET : null}
        </p>
        {msg.tool ? (
          <Badge variant="secondary" className="mt-2 text-neutral-500 text-xs">
            Tools · {msg.tool}
          </Badge>
        ) : null}
      </div>
      {!isAssistant ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary-500">
          <User className="h-4 w-4 text-neutral-0" />
        </div>
      ) : null}
    </div>
  );
};

const AssistantPane: React.FC<{
  messages: ChatMsg[];
  chatText: string;
  chatCaret: boolean;
  sendActive: boolean;
}> = ({ messages, chatText, chatCaret, sendActive }) => (
  <div className="flex h-full flex-col bg-neutral-0">
    <div className="flex w-full items-center justify-between gap-2 border-neutral-200 border-b bg-neutral-0 px-4 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-primary-500" />
        <h3 className="font-medium text-neutral-900 text-sm">Assistant</h3>
      </div>
      <Badge variant="secondary" className="bg-brand-primary-50 text-brand-primary-500 text-xs">
        🎯 Claim-focused
      </Badge>
    </div>
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
        <div className="flex min-h-10 w-full items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm">
          {chatText ? (
            <span className="text-neutral-900">
              {chatText}
              {chatCaret ? CARET : null}
            </span>
          ) : (
            <span className="text-neutral-400">Ask about this claim...</span>
          )}
        </div>
        <span
          style={{
            transform: `scale(${sendActive ? 0.92 : 1})`,
            boxShadow: sendActive ? "0 0 0 3px rgba(39,70,110,0.25)" : "none",
            borderRadius: 8,
            transition: "none",
          }}
        >
          <Btn size="icon" className="shrink-0">
            <Send className="h-4 w-4" />
          </Btn>
        </span>
      </div>
    </div>
  </div>
);

// ── Header ─────────────────────────────────────────────────────────────────────
const HeaderBar: React.FC<{
  status: "awaiting_approval" | "submitted";
  approveActive: boolean;
}> = ({ status, approveActive }) => (
  <div className="border-neutral-200 border-b bg-neutral-0 px-6 py-3">
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
          <Badge
            variant="outline"
            className={
              status === "submitted"
                ? "font-medium bg-neutral-100 text-neutral-700 border-neutral-200"
                : "font-medium bg-brand-primary-50 text-brand-primary-500 border-brand-primary-500/20"
            }
          >
            {status === "submitted" ? "Submitted" : "Awaiting Approval"}
          </Badge>
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
          <Btn variant="ghost" size="sm">
            <Edit className="mr-2 h-4 w-4" />
            Edit draft
          </Btn>
          <Btn variant="ghost" size="sm" className="text-semantic-danger">
            <XCircle className="mr-2 h-4 w-4" />
            Cancel claim
          </Btn>
          <span
            style={{
              transform: `scale(${approveActive ? 0.94 : 1})`,
              boxShadow: approveActive ? "0 0 0 3px rgba(39,70,110,0.25)" : "none",
              borderRadius: 10,
              transition: "none",
            }}
          >
            <Btn size="sm">
              <Send className="mr-2 h-4 w-4" />
              Approve and send
            </Btn>
          </span>
        </div>
      </div>
    </div>
  </div>
);

export type ShellState = {
  draftText: string;
  draftCaret: boolean;
  versionLabel: string;
  draftBodyOpacity: number;
  focus: Focus;
  messages: ChatMsg[];
  chatText: string;
  chatCaret: boolean;
  sendActive: boolean;
  status: "awaiting_approval" | "submitted";
  approveActive: boolean;
};

export const ClaimShellClean: React.FC<ShellState> = (s) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        width: 1560,
        height: 840,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.10)",
        boxShadow: "0 30px 80px rgba(15,23,42,0.16)",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HeaderBar status={s.status} approveActive={s.approveActive} />
      <div className="min-h-0 flex-1 bg-neutral-50">
        <div className="flex h-full">
          <div
            className="border-neutral-200 border-r"
            style={{ width: "40%", ...paneStyle(s.focus.draft) }}
          >
            <DraftPane
              text={s.draftText}
              caret={s.draftCaret}
              versionLabel={s.versionLabel}
              bodyOpacity={s.draftBodyOpacity}
            />
          </div>
          <div className="flex flex-col" style={{ width: "60%" }}>
            <div
              className="border-neutral-200 border-b"
              style={{ height: "60%", ...paneStyle(s.focus.evidence) }}
            >
              <EvidencePane />
            </div>
            <div style={{ height: "40%", ...paneStyle(s.focus.assistant) }}>
              <AssistantPane
                messages={s.messages}
                chatText={s.chatText}
                chatCaret={s.chatCaret}
                sendActive={s.sendActive}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
