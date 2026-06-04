// ─────────────────────────────────────────────────────────────────────────
// Authenticated chrome — sidebar + top header — verbatim from
// apps/web/src/components/layout/{sidebar,authenticated-shell}.tsx.
// Responsive `lg:` prefixes are resolved to their desktop form (the
// composition is a fixed 1920px viewport). Sidebar is in-flow here (vs the
// real `fixed` + `pl-64`) which is visually identical at desktop width.
// ─────────────────────────────────────────────────────────────────────────
import {
  Bell,
  BotMessageSquare,
  ChevronDown,
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquareText,
  Moon,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { cn } from "./_ui";

type NavKey =
  | "Dashboard"
  | "Claims"
  | "Purchases"
  | "Assistant"
  | "Notifications"
  | "Settings"
  | "Help";

const GROUPS: { label: string; links: { label: NavKey; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Main",
    links: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Claims", icon: FileText },
      { label: "Purchases", icon: ShoppingBag },
    ],
  },
  {
    label: "Assistant",
    links: [
      { label: "Assistant", icon: BotMessageSquare },
      { label: "Notifications", icon: Bell },
    ],
  },
];
const BOTTOM: { label: NavKey; icon: typeof LayoutDashboard }[] = [
  { label: "Settings", icon: Settings },
  { label: "Help", icon: HelpCircle },
];

function NavItem({ label, Icon, active }: { label: string; Icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <li>
      <span
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-brand-primary-50 text-brand-primary-600"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        )}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
        {label}
      </span>
    </li>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <div className="flex flex-col h-full bg-neutral-0">
      <div className="h-16 flex items-center px-6 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-brand-primary-500" size={28} strokeWidth={2.25} aria-hidden="true" />
          <span className="font-semibold text-neutral-900 text-lg">ClaimIt</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <h2 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {group.label}
            </h2>
            <ul className="space-y-1">
              {group.links.map((l) => (
                <NavItem key={l.label} label={l.label} Icon={l.icon} active={l.label === active} />
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h2 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Actions
          </h2>
          <ul className="space-y-1">
            <li>
              <span className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors text-left">
                <Receipt className="w-5 h-5" aria-hidden="true" />
                Upload receipt
              </span>
            </li>
          </ul>
        </div>
      </nav>

      <div className="px-4 pb-4">
        <div className="my-3 h-px w-full bg-neutral-200" />
        <ul className="space-y-1">
          {BOTTOM.map((l) => (
            <NavItem key={l.label} label={l.label} Icon={l.icon} active={l.label === active} />
          ))}
        </ul>
      </div>

      <div className="p-4 border-t border-neutral-200">
        <div className="text-xs text-neutral-500">ClaimIt Beta v1.0</div>
      </div>
    </div>
  );
}

function TopHeader() {
  return (
    <header className="sticky top-0 z-40 h-16 bg-neutral-0 border-b border-neutral-200 flex items-center justify-between px-8">
      <div />
      <div className="flex items-center gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500">
          <Moon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="relative inline-flex size-8 items-center justify-center rounded-lg">
          <Bell className="w-5 h-5 text-neutral-600" aria-hidden="true" />
        </span>
        <span className="inline-flex h-8 items-center gap-2 rounded-lg px-2">
          <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-primary-100 text-sm font-medium text-brand-primary-700">
            JD
          </span>
          <span className="text-sm font-medium text-neutral-700">Jane Doe</span>
          <ChevronDown className="w-4 h-4 text-neutral-500" aria-hidden="true" />
        </span>
      </div>
    </header>
  );
}

/** Floating assistant FAB (default variant) — shown on dashboard/claims/purchases. */
export function Fab() {
  return (
    <div className="absolute bottom-6 right-6 z-50">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-primary-500 text-neutral-0 shadow-lg">
        <MessageSquareText className="h-6 w-6" aria-hidden="true" />
      </span>
    </div>
  );
}

export function AppChrome({
  active,
  children,
  showFab = false,
  overlay,
}: {
  active: string;
  children: ReactNode;
  showFab?: boolean;
  overlay?: ReactNode;
}) {
  return (
    <AbsoluteFill className="bg-neutral-0" style={{ display: "flex", flexDirection: "row" }}>
      <aside className="flex w-64 flex-col bg-neutral-0 border-r border-neutral-200" style={{ height: "100%" }}>
        <Sidebar active={active} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      {showFab ? <Fab /> : null}
      {overlay}
    </AbsoluteFill>
  );
}
