"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const termsSections = [
  { id: "acceptance", title: "Acceptance of terms" },
  { id: "service-description", title: "Service description" },
  { id: "account-eligibility", title: "Account and eligibility" },
  { id: "gmail-connection", title: "Gmail connection and user authorization" },
  { id: "user-responsibilities", title: "User responsibilities" },
  { id: "claim-materials", title: "Claim materials and no guarantee" },
  { id: "approval-auto-send", title: "Approval and auto-send preferences" },
  { id: "user-reported-outcomes", title: "User-reported outcomes" },
  { id: "subscriptions", title: "Subscriptions and trials" },
  { id: "prohibited-use", title: "Prohibited use" },
  { id: "third-party-services", title: "Third-party services" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "limitation-of-liability", title: "Limitation of liability" },
  { id: "termination", title: "Termination" },
  { id: "changes-to-terms", title: "Changes to terms" },
  { id: "contact", title: "Contact" },
];

export function TermsTableOfContents() {
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -80% 0px" },
    );

    termsSections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <aside className="mb-8 lg:mb-0">
      <nav className="lg:sticky lg:top-24">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-900">
          Table of Contents
        </h2>
        <ul className="space-y-2 border-l border-neutral-200">
          {termsSections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => scrollToSection(section.id)}
                className={cn(
                  "-ml-px border-l-2 py-1 pl-4 text-left text-sm transition-colors",
                  activeSection === section.id
                    ? "border-brand-primary-500 text-brand-primary-500 font-medium"
                    : "border-transparent text-neutral-700 hover:border-neutral-300 hover:text-neutral-900",
                )}
              >
                {section.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
