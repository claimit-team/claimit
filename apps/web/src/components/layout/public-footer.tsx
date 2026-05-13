import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const footerGroups = [
  {
    title: "Product",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/team", label: "Team" },
      { href: "/careers", label: "Careers" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/help", label: "Help Center" },
      { href: "/blog", label: "Blog" },
      { href: "/changelog", label: "Changelog" },
      { href: "/help/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-0">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-neutral-900">{group.title}</h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-neutral-700 transition-colors hover:text-neutral-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8 bg-neutral-200" />
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck
              className="text-brand-primary-500"
              strokeWidth={2.25}
              size={28}
              aria-hidden
            />
            <span className="text-sm font-semibold text-neutral-900">ClaimIt</span>
          </Link>
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} ClaimIt. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
