"use client";

import { Card } from "@/components/ui/card";

// Team photos: drop {name}.png (lowercase) in apps/web/public/team/
// Aspect ratio is auto-cropped to a circle from center — any source size works
// Missing photos automatically fallback to initials
const mockTeamMembers = [
  {
    name: "Erdun",
    role: "Co-Founder & CEO",
    bio: "Leads product direction, frontend, infrastructure planning, and demo execution.",
    avatarUrl: "/team/erdun.png",
  },
  {
    name: "Raj Kavathekar",
    role: "Co-Founder & CMO",
    bio: "Builds agent prompts, tool routing, and policy-aware workflow logic.",
    avatarUrl: "/team/raj.png",
  },
  {
    name: "Will Wan",
    role: "Co-Founder & CTO",
    bio: "Owns cloud infrastructure, data services, deployment, and reliability.",
    avatarUrl: "/team/will.png",
  },
  {
    name: "Chris",
    role: "Co-Founder & COO",
    bio: "Works on claim generation, Assistant behavior, and agent evaluation.",
    avatarUrl: "/team/chris.png",
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
    <section className="bg-neutral-0 py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center text-2xl font-semibold text-neutral-900">Meet the team</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mockTeamMembers.map((member) => (
            <Card
              key={member.name}
              className="group relative flex flex-col items-center overflow-hidden border border-neutral-200 bg-neutral-0 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="relative h-28 w-28 overflow-hidden rounded-full bg-neutral-100 ring-4 ring-neutral-100 transition-all duration-300 group-hover:ring-brand-primary-100">
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-neutral-400">
                  {getInitials(member.name)}
                </div>
                {member.avatarUrl && (
                  // biome-ignore lint/performance/noImgElement: static team photos with onError fallback to initials
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>

              <div className="mt-6 flex flex-col items-center text-center">
                <h3 className="text-lg font-semibold text-neutral-900">{member.name}</h3>
                <p className="mt-1 text-sm text-neutral-500">{member.role}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
