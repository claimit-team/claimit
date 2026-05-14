import type { SVGProps } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const mockTeamMembers = [
  {
    name: "Erdun",
    role: "Co-Founder & CEO",
    bio: "Leads product direction, frontend, infrastructure planning, and demo execution.",
    links: { linkedin: "#", github: "#" },
  },
  {
    name: "Raj Kavathekar",
    role: "Co-Founder & CMO",
    bio: "Builds agent prompts, tool routing, and policy-aware workflow logic.",
    links: { linkedin: "#", github: "#" },
  },
  {
    name: "Will Wan",
    role: "Co-Founder & CTO",
    bio: "Owns cloud infrastructure, data services, deployment, and reliability.",
    links: { linkedin: "#", github: "#" },
  },
  {
    name: "Chris",
    role: "Co-Founder & COO",
    bio: "Works on claim generation, Assistant behavior, and agent evaluation.",
    links: { linkedin: "#", github: "#" },
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" {...props}>
      <title>LinkedIn</title>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" {...props}>
      <title>GitHub</title>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function SocialPlaceholder({ label, icon: Icon }: { label: string; icon: typeof LinkedinIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-disabled="true"
        className={cn(
          "flex size-8 cursor-not-allowed items-center justify-center rounded-md text-neutral-400",
        )}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{label} · Coming soon</TooltipContent>
    </Tooltip>
  );
}

export function TeamMemberGrid() {
  return (
    <section className="bg-neutral-0 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center text-2xl font-semibold text-neutral-900">Meet the team</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {mockTeamMembers.map((member) => (
            <Card key={member.name} className="border-neutral-200 bg-neutral-0 shadow-sm">
              <CardContent className="flex flex-col items-center pt-6 text-center">
                <Avatar className="size-16">
                  <AvatarFallback className="bg-neutral-100 text-lg text-neutral-700">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <h3 className="mt-4 text-base font-semibold text-neutral-900">{member.name}</h3>
                <p className="mt-1 text-sm text-neutral-500">{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-700">{member.bio}</p>
                <div className="mt-4 flex gap-2">
                  <SocialPlaceholder label={`${member.name} on LinkedIn`} icon={LinkedinIcon} />
                  <SocialPlaceholder label={`${member.name} on GitHub`} icon={GithubIcon} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
