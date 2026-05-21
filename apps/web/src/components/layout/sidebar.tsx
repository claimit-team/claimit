"use client";

import {
  Bell,
  BotMessageSquare,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

type SidebarLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type SidebarGroup = {
  id: string;
  label: string;
  links: ReadonlyArray<SidebarLink>;
};

const sidebarGroups: ReadonlyArray<SidebarGroup> = [
  {
    id: "main",
    label: "Main",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/claims", label: "Claims", icon: FileText },
      { href: "/purchases", label: "Purchases", icon: ShoppingBag },
    ],
  },
  {
    id: "assistant",
    label: "Assistant",
    links: [
      { href: "/assistant", label: "Assistant", icon: BotMessageSquare },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

const bottomLinks: ReadonlyArray<SidebarLink> = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLinkItem({ link, pathname }: { link: SidebarLink; pathname: string }) {
  const active = isActive(pathname, link.href);
  return (
    <li>
      <Link
        href={link.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-brand-primary-50 text-brand-primary-600"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        )}
      >
        <link.icon className="w-5 h-5" aria-hidden="true" />
        {link.label}
      </Link>
    </li>
  );
}

export function SidebarContent() {
  const pathname = usePathname();
  // Per ticket 5.14 B2 the Upload entry is a button that opens the
  // global upload Dialog (mounted in the authenticated layout) rather
  // than a Link to a separate page. Keeping it inside the same
  // grouped layout as the navigation links keeps the visual rhythm
  // intact.
  const openUploadDialog = useUIStore((s) => s.setUploadDialogOpen);

  return (
    <div className="flex flex-col h-full bg-neutral-0">
      <div className="h-16 flex items-center px-6 border-b border-neutral-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <ShieldCheck
            className="text-brand-primary-500"
            size={28}
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="font-semibold text-neutral-900 text-lg">ClaimIt</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-6">
        {sidebarGroups.map((group) => (
          <div key={group.id}>
            <h2 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {group.label}
            </h2>
            <ul className="space-y-1">
              {group.links.map((link) => (
                <SidebarLinkItem key={link.href} link={link} pathname={pathname} />
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
              <button
                type="button"
                onClick={() => openUploadDialog(true)}
                className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors text-left"
              >
                <Receipt className="w-5 h-5" aria-hidden="true" />
                Upload receipt
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div className="px-4 pb-4">
        <Separator className="my-3 bg-neutral-200" />
        <ul className="space-y-1">
          {bottomLinks.map((link) => (
            <SidebarLinkItem key={link.href} link={link} pathname={pathname} />
          ))}
        </ul>
      </div>

      <div className="p-4 border-t border-neutral-200">
        <div className="text-xs text-neutral-500">ClaimIt Beta v1.0</div>
      </div>
    </div>
  );
}
