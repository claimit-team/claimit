import { ArrowRight, FileText, HelpCircle, History, ShieldCheck } from "lucide-react";
import Link from "next/link";

const resources = [
  {
    href: "/how-it-works",
    label: "How ClaimIt works",
    icon: FileText,
  },
  {
    href: "/security",
    label: "Security and privacy",
    icon: ShieldCheck,
  },
  {
    href: "/changelog",
    label: "Changelog",
    icon: History,
  },
  {
    href: "/help",
    label: "Help center",
    icon: HelpCircle,
  },
];

export function RelatedResources() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
      <h3 className="text-lg font-semibold text-neutral-900">Related resources</h3>

      <ul className="mt-4 space-y-2">
        {resources.map((resource) => {
          const Icon = resource.icon;
          return (
            <li key={resource.href}>
              <Link
                href={resource.href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                <Icon className="size-4 text-neutral-500" aria-hidden="true" />
                <span className="flex-1">{resource.label}</span>
                <ArrowRight
                  className="size-4 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
