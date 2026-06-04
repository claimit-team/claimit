// ─────────────────────────────────────────────────────────────────────────
// Page-content blocks for the non-claim uirefs (dashboard / claims / confirm /
// purchase / upload-modal / sent-toast). Classes copied from the corresponding
// apps/web pages + components; data hard-coded from the Costco fixture.
// ─────────────────────────────────────────────────────────────────────────
import {
  ArrowLeft,
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ExternalLink,
  FileText,
  Receipt,
  Search,
  ShoppingBag,
  StopCircle,
  TrendingDown,
  TrendingUp,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { COSTCO, LIST_CLAIMS, PRICE_SERIES } from "./_data";
import { Badge, Btn, Card, CardContent, CardHeader, CardTitle, cn, OutcomeBadge, PlatformLogo } from "./_ui";

// ── Dashboard ────────────────────────────────────────────────────────────────
function PageHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-neutral-600 mt-1">
          Monitor purchases, review claims, and keep your refund workflow moving.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="gap-1.5 text-neutral-600">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-accent-500" />
          Gmail connected
        </Badge>
        <Btn>
          <Receipt className="mr-2 h-4 w-4" />
          Upload receipt
        </Btn>
      </div>
    </div>
  );
}

function HeroNewUser() {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-12">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">
            Start by adding your first purchase
          </h2>
          <p className="text-neutral-600 mb-6">
            Upload a receipt or connect Gmail so ClaimIt can begin monitoring eligible price
            protection windows.
          </p>
          <div className="w-full border-2 border-dashed rounded-xl p-12 border-neutral-300">
            <UploadCloud className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
            <span className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-brand-primary-500 text-neutral-0 text-sm font-medium mb-3">
              Browse files
            </span>
            <p className="text-sm text-neutral-500">PDF, PNG, or JPG up to 10 MB</p>
          </div>
          <span className="text-sm text-brand-primary-500 mt-4 inline-block">Or connect Gmail →</span>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroActiveUser() {
  return (
    <Card className="border-neutral-200">
      <CardContent className="p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            2 claims in progress · 1 purchases monitored
          </h2>
          <p className="text-neutral-600 mt-1">
            ClaimIt is watching your active purchase windows and will surface actions when something
            needs review.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: <FileText className="w-5 h-5 text-brand-primary-600" />, n: "2", label: "Claims in progress" },
            { icon: <ShoppingBag className="w-5 h-5 text-brand-primary-600" />, n: "1", label: "Purchases monitored" },
          ].map((t) => (
            <div key={t.label} className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-primary-100 flex items-center justify-center">
                  {t.icon}
                </div>
                <div>
                  <div className="text-2xl font-semibold text-neutral-900 tabular-nums">{t.n}</div>
                  <div className="text-sm text-neutral-600">{t.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Btn variant="outline" size="sm" className="inline-flex items-center">
            Review claims
          </Btn>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
      {action}
    </div>
  );
}

export function DashboardContent({ mode }: { mode: "empty" | "loaded" }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="space-y-10">
          <PageHeader />
          {mode === "empty" ? (
            <HeroNewUser />
          ) : (
            <>
              <HeroActiveUser />
              {/* Needs your attention (reconstructed from the design system —
                  dashboard/page.tsx section bodies weren't transcribed). */}
              <section>
                <SectionHeader title="Needs your attention" />
                <Card className="border-neutral-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <PlatformLogo platform="costco" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-neutral-900">{COSTCO.productName}</div>
                        <div className="text-sm text-neutral-500">
                          Draft ready — review and approve your $100.00 price-match claim
                        </div>
                      </div>
                      <OutcomeBadge outcome="draft_pending" />
                      <Btn size="sm">Review draft</Btn>
                    </div>
                  </CardContent>
                </Card>
              </section>
              <section>
                <SectionHeader
                  title="Monitored purchases"
                  action={<span className="text-sm font-medium text-brand-primary-500">View all →</span>}
                />
                <Card className="border-neutral-200">
                  <CardContent className="p-0">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <PlatformLogo platform="costco" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-neutral-900">{COSTCO.productName}</div>
                        <div className="text-xs text-neutral-500">Costco · Retail</div>
                      </div>
                      <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-700">
                        Eligible drop
                      </Badge>
                      <span className="flex items-center gap-1 text-sm text-semantic-warning">21 days remaining</span>
                    </div>
                  </CardContent>
                </Card>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Claims list ──────────────────────────────────────────────────────────────
const CHIPS: { label: string; count: number; active: boolean }[] = [
  { label: "All", count: 4, active: true },
  { label: "Pending", count: 1, active: false },
  { label: "In progress", count: 1, active: false },
  { label: "Resolved", count: 2, active: false },
];

export function ClaimsContent() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Claims</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Track drafts, submissions, and outcomes across every monitored purchase.
          </p>
        </div>

        <div className="border-b border-neutral-100 py-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                    c.active
                      ? "border-brand-primary-500 bg-brand-primary-500 text-primary-foreground"
                      : "border-neutral-200 bg-neutral-0 text-neutral-700",
                  )}
                >
                  {c.label}
                  <span
                    className={cn(
                      "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-medium",
                      c.active ? "bg-white/20 text-primary-foreground" : "bg-neutral-100 text-neutral-600",
                    )}
                  >
                    {c.count}
                  </span>
                </span>
              ))}
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent pl-9 pr-3 text-sm text-neutral-400">
                Search platform or product…
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b">
                {["Status", "Platform / Product", "Type", "Amount", "Window / Resolved", "Submitted", "Action"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "h-10 px-2 align-middle font-medium whitespace-nowrap text-foreground",
                        i === 3 || i === 6 ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {LIST_CLAIMS.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2 align-middle">
                    <OutcomeBadge outcome={c.outcome} />
                  </td>
                  <td className="p-2 align-middle">
                    <div className="flex items-center gap-3">
                      <PlatformLogo platform={c.platformRaw} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-neutral-900">{c.product}</span>
                        <span className="text-xs text-neutral-500">{c.platformLabel}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-2 align-middle text-sm text-neutral-700">{c.type}</td>
                  <td
                    className={cn(
                      "p-2 align-middle text-right font-medium tabular-nums",
                      c.outcome === "approved" ? "text-brand-accent-500" : "text-neutral-700",
                    )}
                  >
                    {c.amountStr}
                  </td>
                  <td className="p-2 align-middle text-sm text-neutral-700">{c.windowCell}</td>
                  <td className="p-2 align-middle text-sm text-neutral-500">{c.submitted}</td>
                  <td className="p-2 align-middle text-right">
                    <Btn variant="outline" size="sm">
                      View
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Confirm / OCR ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </div>
  );
}
function InputBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm text-neutral-900", className)}>
      {children}
    </div>
  );
}

export function ConfirmContent() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">Review purchase details</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Confirm the extracted information before ClaimIt starts monitoring.
          </p>
        </div>
        <div className="flex gap-8">
          <div className="w-2/5 shrink-0">
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0">
              <div className="border-neutral-100 border-b px-4 py-2 text-xs text-neutral-500">
                receipt.pdf
              </div>
              <div className="flex h-[420px] items-center justify-center bg-neutral-50">
                <div className="w-3/4 rounded-md border border-neutral-200 bg-neutral-0 p-5 shadow-sm">
                  <div className="text-center text-sm font-semibold text-neutral-700">COSTCO WHOLESALE</div>
                  <div className="mt-3 space-y-1.5 text-[11px] text-neutral-500">
                    <div className="flex justify-between"><span>Apple iPad Air 11" M2</span><span>$599.99</span></div>
                    <div className="flex justify-between"><span>Item 1820413</span><span /></div>
                    <div className="my-2 border-t border-dashed border-neutral-200" />
                    <div className="flex justify-between font-medium text-neutral-700"><span>Order</span><span>1185402639</span></div>
                    <div className="flex justify-between"><span>Date</span><span>05/22/2026</span></div>
                    <div className="flex justify-between font-semibold text-neutral-800"><span>TOTAL</span><span>$599.99</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-6">
              <div className="space-y-6">
                <Field label="Platform">
                  <div className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm text-neutral-900">
                    Costco
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  </div>
                </Field>
                <Field label="Product / item name">
                  <InputBox>{COSTCO.productName}</InputBox>
                </Field>
                <Field label="Purchase price">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                    <InputBox className="pl-7">599.99</InputBox>
                  </div>
                </Field>
                <Field label="Purchase date">
                  <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm font-normal text-neutral-900">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    May 22, 2026
                  </div>
                </Field>
                <Field label="Order ID / confirmation number">
                  <InputBox>{COSTCO.orderId}</InputBox>
                </Field>
                <div className="space-y-3">
                  <span className="block text-sm font-medium text-neutral-700">Category</span>
                  <div className="flex flex-wrap gap-4">
                    {["Retail", "Airline", "Hotel"].map((cat, i) => (
                      <div key={cat} className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full border",
                            i === 0 ? "border-brand-primary-500" : "border-neutral-300",
                          )}
                        >
                          {i === 0 ? <span className="h-2 w-2 rounded-full bg-brand-primary-500" /> : null}
                        </span>
                        <span className="text-sm text-neutral-700">{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
                  <span className="text-sm font-medium text-neutral-700">Additional details</span>
                  <ChevronDown className="h-4 w-4 text-neutral-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-0 px-8 py-4">
        <Btn variant="outline">Cancel</Btn>
        <Btn>Confirm &amp; start monitoring</Btn>
      </div>
    </div>
  );
}

// ── Purchase detail (with recharts chart) ────────────────────────────────────
function PaidDot(props: { cx?: number; cy?: number; payload?: { price: number } }) {
  const { cx, cy, payload } = props;
  if (payload && payload.price < COSTCO.pricePaid) {
    return <circle cx={cx} cy={cy} r={6} fill="var(--semantic-warning)" stroke="var(--neutral-0)" strokeWidth={2} />;
  }
  return <circle cx={cx} cy={cy} r={0} fill="transparent" />;
}

function StatItem({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-neutral-500 text-xs">{label}</span>
      </div>
      <span className="font-medium text-neutral-900 text-sm tabular-nums">{value}</span>
    </div>
  );
}

function PriceHistoryChartView() {
  return (
    <Card className="bg-neutral-0">
      <CardHeader>
        <CardTitle className="font-semibold text-lg text-neutral-900">Price history</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <div className="min-w-0 flex-1">
            <LineChart
              width={640}
              height={280}
              data={PRICE_SERIES}
              margin={{ top: 10, right: 64, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="formattedDate"
                tick={{ fill: "var(--neutral-500)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--neutral-200)" }}
              />
              <YAxis
                domain={[489, 610]}
                tick={{ fill: "var(--neutral-500)", fontSize: 12 }}
                tickFormatter={(v: number) => `$${v}`}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <ReferenceLine
                y={COSTCO.pricePaid}
                stroke="var(--neutral-200)"
                strokeDasharray="5 5"
                label={{ value: "Paid $599.99", fill: "var(--neutral-500)", fontSize: 11, position: "right" }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--neutral-500)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={<PaidDot />}
              />
            </LineChart>
          </div>
          <div className="w-48 shrink-0">
            <div className="flex flex-col gap-3">
              <StatItem label="Highest seen" value="$599.99" icon={<TrendingUp className="size-4 text-neutral-500" />} />
              <StatItem label="Lowest seen" value="$499.99" icon={<TrendingDown className="size-4 text-neutral-500" />} />
              <StatItem label="Current price" value="$499.99" icon={<CircleDot className="size-4 text-neutral-500" />} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-neutral-500 text-xs">Updated 3 days ago · from Costco</p>
      </CardContent>
    </Card>
  );
}

function RefundEligibilityView() {
  return (
    <Card className="bg-neutral-0">
      <CardHeader>
        <CardTitle className="font-semibold text-lg text-neutral-900">Refund eligibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-neutral-700 text-sm">
          Active monitoring — <span className="font-medium">21 days remaining</span> in price match window
        </p>
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-brand-primary-500" style={{ width: "30%" }} />
          </div>
          <div className="flex justify-between text-neutral-500 text-xs">
            <span>May 22</span>
            <span>Jun 21</span>
          </div>
        </div>
        <blockquote className="border-neutral-200 border-l-2 pl-4 text-neutral-700 text-sm italic">
          {COSTCO.policyClause}
        </blockquote>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary-500">
          <ExternalLink className="size-4" />
          Read full policy
        </span>
      </CardContent>
    </Card>
  );
}

export function PurchaseContent() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[960px] px-6 py-6">
        <div className="space-y-6">
          {/* Purchase page header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
                <ArrowLeft className="size-4 text-neutral-600" />
              </span>
              <nav className="flex min-w-0 items-center gap-2 text-neutral-500 text-sm">
                <span className="shrink-0">Purchases</span>
                <span className="shrink-0">/</span>
                <span className="truncate font-medium text-neutral-900">{COSTCO.productName}</span>
              </nav>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <PlatformLogo platform="costco" />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="font-semibold text-2xl text-neutral-900">{COSTCO.productName}</h1>
                    <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-100 text-blue-700">
                      Eligible drop
                    </Badge>
                  </div>
                  <p className="text-neutral-500 text-sm">
                    Costco · Retail · Purchased May 22, 2026 · Order {COSTCO.orderId}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Btn variant="ghost" size="sm" className="gap-1.5">
                  <StopCircle className="size-4" />
                  Stop monitoring
                </Btn>
                <Btn variant="outline" size="sm" className="gap-1.5">
                  <Upload className="size-4" />
                  Re-upload receipt
                </Btn>
              </div>
            </div>
          </div>

          <PriceHistoryChartView />
          <RefundEligibilityView />
        </div>
      </div>
    </div>
  );
}

// ── Upload modal overlay (over dashboard) ────────────────────────────────────
export function UploadModal() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10">
      <div className="relative grid w-full max-w-lg gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-xl">
        <span className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-neutral-500">
          <X className="size-4" />
        </span>
        <div className="flex flex-col gap-2">
          <div className="font-heading text-base leading-none font-medium text-neutral-900">Upload a receipt</div>
          <p className="text-sm text-muted-foreground">
            ClaimIt extracts the purchase details and starts monitoring the eligible window. PDF, PNG, or JPG up to 10 MB.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-neutral-300 p-8 text-center">
          <UploadCloud className="size-10 text-neutral-400" />
          <div>
            <p className="text-sm font-medium text-neutral-900">Drag a receipt here</p>
            <p className="mt-1 text-xs text-neutral-500">PDF, PNG, or JPG up to 10 MB.</p>
          </div>
          <Btn variant="outline">Browse files</Btn>
        </div>
        <div className="-mx-4 -mb-4 flex justify-end gap-2 rounded-b-xl border-t bg-muted/50 p-4">
          <Btn variant="outline">Cancel</Btn>
          <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium bg-neutral-200 text-neutral-400">
            Upload receipt
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Sonner toast (sent confirmation) ─────────────────────────────────────────
export function SentToast() {
  return (
    <div className="absolute bottom-8 right-8 z-50">
      <div className="flex w-[356px] items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-3 text-sm text-neutral-900 shadow-lg">
        <CheckCircle2 className="h-5 w-5 text-semantic-success" />
        Claim approved
      </div>
    </div>
  );
}
