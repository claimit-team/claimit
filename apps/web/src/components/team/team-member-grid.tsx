import { ExternalLinkIcon, FolderGitIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
                  <Link
                    href={member.links.linkedin}
                    aria-label={`${member.name} on LinkedIn`}
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                  >
                    <ExternalLinkIcon className="size-4" />
                  </Link>
                  <Link
                    href={member.links.github}
                    aria-label={`${member.name} on GitHub`}
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                  >
                    <FolderGitIcon className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
