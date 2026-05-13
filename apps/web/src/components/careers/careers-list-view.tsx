"use client";

import { ArrowRight, Upload } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const mockCareersData = {
  roles: [
    {
      title: "Frontend Engineer",
      slug: "frontend-engineer",
      area: "Frontend",
      description: "Build dashboard workflows, claim review screens, and Assistant UI in Next.js.",
    },
    {
      title: "Backend / Infrastructure Engineer",
      slug: "backend-infrastructure-engineer",
      area: "Infrastructure",
      description: "Work on GCP, Pub/Sub, Cloud Run, MongoDB, and deployment reliability.",
    },
    {
      title: "Agent Logic Engineer",
      slug: "agent-logic-engineer",
      area: "Agent Logic",
      description: "Develop Gemini prompts, tool routing, validators, and evaluation flows.",
    },
  ],
  interestAreas: [
    "Frontend",
    "Backend / Infrastructure",
    "Agent Logic",
    "Product / Design",
    "Other",
  ],
  workingPrinciples: [
    {
      title: "User control first",
      description:
        "Users should always understand and approve what the agent is doing on their behalf.",
    },
    {
      title: "Agent decisions should be explainable",
      description: "Every recommendation or action should have a clear, traceable reasoning path.",
    },
    {
      title: "No invented financial claims",
      description: "We only surface verified data from receipts and retailer policies.",
    },
    {
      title: "Small, reliable workflows over broad automation",
      description: "We prefer doing fewer things well rather than many things poorly.",
    },
  ],
  faq: [
    {
      question: "Are these active openings?",
      answer:
        "No. These roles are placeholders representing future hiring areas. ClaimIt is currently an MVP and is not actively recruiting for these positions.",
    },
    {
      question: "Can I submit interest for future roles?",
      answer:
        "Yes. The interest form on this page is a mock form for demonstration purposes. In a production version, your information would be stored for future consideration.",
    },
    {
      question: "Is ClaimIt remote?",
      answer:
        "Work format has not been finalized. As an early-stage project, we have not established formal policies around location or remote work.",
    },
    {
      question: "What kind of work does the team focus on?",
      answer:
        "The team focuses on agent workflows for price protection monitoring, data infrastructure for receipt and claim processing, and dashboard UX for reviewing and managing claims.",
    },
  ],
};

function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  toast.success("Thanks — your interest has been recorded in this mock flow.");
}

export function CareersListView() {
  return (
    <div className="bg-neutral-0">
      {/* Hero Section */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl text-balance">
            Build practical agents for real-world follow-through.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-neutral-700 text-pretty">
            ClaimIt is early. We are not hiring broadly yet, but we are interested in people who
            care about reliable agent workflows, user control, and calm financial product design.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="#interest-form"
              className={cn(
                buttonVariants(),
                "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
              )}
            >
              Drop your resume
            </Link>
            <Link
              href="/team"
              className={cn(buttonVariants({ variant: "ghost" }), "text-neutral-700")}
            >
              Meet the team
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Current Status Section */}
      <section className="py-12">
        <div className="mx-auto max-w-2xl px-6">
          <Card className="border-neutral-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle className="text-neutral-900">Where we are now</CardTitle>
                <Badge variant="secondary" className="bg-neutral-100 text-neutral-700">
                  Early stage
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-neutral-700">
                ClaimIt is currently an MVP built for the Google Cloud Rapid Agent Hackathon.
              </p>
              <p className="text-sm text-neutral-700">
                We are focused on product validation, agent reliability, and demo-quality execution.
              </p>
              <p className="text-sm text-neutral-700">
                Open roles below are placeholders for future hiring areas, not active job offers.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Role Areas Section */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900">Role areas</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Example future roles — not active openings yet.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {mockCareersData.roles.map((role) => (
              <Card
                key={role.slug}
                className="border-neutral-200 transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <div className="mb-2">
                    <Badge variant="outline" className="border-neutral-200 text-neutral-600">
                      {role.area}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg text-neutral-900">{role.title}</CardTitle>
                  <CardDescription className="text-neutral-700">{role.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/careers/${role.slug}`}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "h-auto p-0 text-brand-primary-500 hover:bg-transparent hover:text-brand-primary-600",
                    )}
                  >
                    View role
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How We Work Section */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-8 text-2xl font-semibold text-neutral-900">How we work</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {mockCareersData.workingPrinciples.map((principle) => (
              <Card key={principle.title} className="border-neutral-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-neutral-900">{principle.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-neutral-700">{principle.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Resume Interest Form Section */}
      <section id="interest-form" className="py-12">
        <div className="mx-auto max-w-xl px-6">
          <Card className="border-neutral-200">
            <CardHeader>
              <CardTitle className="text-xl text-neutral-900">Submit your interest</CardTitle>
              <CardDescription className="text-neutral-700">
                Leave your details and we may reach out when we begin hiring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-neutral-900">
                    Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="Your name"
                    required
                    className="border-neutral-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-neutral-900">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    className="border-neutral-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area" className="text-neutral-900">
                    Area of interest
                  </Label>
                  <Select>
                    <SelectTrigger className="w-full border-neutral-200">
                      <SelectValue placeholder="Select an area" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockCareersData.interestAreas.map((area) => (
                        <SelectItem key={area} value={area.toLowerCase()}>
                          {area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile" className="text-neutral-900">
                    LinkedIn or GitHub URL
                  </Label>
                  <Input
                    id="profile"
                    type="url"
                    placeholder="https://linkedin.com/in/..."
                    className="border-neutral-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note" className="text-neutral-900">
                    Short note
                  </Label>
                  <Textarea
                    id="note"
                    placeholder="Tell us a bit about yourself and what interests you about ClaimIt..."
                    rows={4}
                    className="border-neutral-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-neutral-900">
                    Resume <span className="text-neutral-500">(optional)</span>
                  </Label>
                  <div className="flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-100/50 transition-colors hover:border-neutral-400">
                    <div className="flex flex-col items-center gap-1 text-neutral-500">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">Upload PDF (demo only)</span>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600"
                >
                  Submit interest
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="mb-8 text-2xl font-semibold text-neutral-900">
            Frequently asked questions
          </h2>
          <Accordion multiple={false} className="w-full">
            {mockCareersData.faq.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="border-neutral-200"
              >
                <AccordionTrigger className="text-left text-neutral-900 hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-neutral-700">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="border-t border-neutral-200 bg-neutral-100/50 py-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-xl font-semibold text-neutral-900">
            Want to understand the product first?
          </h2>
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/how-it-works"
              className={cn(
                buttonVariants(),
                "bg-brand-primary-500 text-neutral-0 hover:bg-brand-primary-600",
              )}
            >
              See how it works
            </Link>
            <Link
              href="/team"
              className={cn(buttonVariants({ variant: "ghost" }), "text-neutral-700")}
            >
              View team
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
