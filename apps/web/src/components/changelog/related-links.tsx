import { ArrowRight, BookOpen, HelpCircle, Lightbulb, Lock } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const links = [
  { href: "/blog", label: "Blog", icon: BookOpen },
  { href: "/how-it-works", label: "How it works", icon: Lightbulb },
  { href: "/security", label: "Security", icon: Lock },
  { href: "/help", label: "Help", icon: HelpCircle },
];

export function RelatedLinks() {
  return (
    <Card className="mb-12 border-neutral-200 bg-neutral-0">
      <CardHeader>
        <CardTitle className="text-base text-neutral-900">Related resources</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group flex items-center gap-3 rounded-lg border border-neutral-200 p-3 transition-all duration-300 hover:-translate-y-1 hover:border-brand-primary-500 hover:shadow-md"
                >
                  <Icon className="h-5 w-5 text-neutral-500 transition-colors group-hover:text-brand-primary-500" />
                  <span className="flex-1 text-sm font-medium text-neutral-700">{link.label}</span>
                  <ArrowRight className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-brand-primary-500" />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
