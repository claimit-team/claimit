import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  Info,
  Shield,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InterestForm } from "@/components/careers/interest-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllJobSlugs, getJobBySlug } from "@/lib/jobs-data";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllJobSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = getJobBySlug(slug);

  if (!job) {
    return {
      title: "Role not found",
    };
  }

  return {
    title: `${job.title} — Careers`,
    description: job.summary,
  };
}

const productPrinciples = [
  {
    icon: Shield,
    title: "User approval by default",
    description: "Every significant action requires human confirmation.",
  },
  {
    icon: Info,
    title: "No invented financial numbers",
    description: "All monetary data comes from verified sources.",
  },
  {
    icon: Eye,
    title: "Explainable decisions",
    description: "Every agent action can be traced and understood.",
  },
  {
    icon: Volume2,
    title: "Quiet AI, practical automation",
    description: "Helpful without being intrusive.",
  },
];

export default async function CareerDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const job = getJobBySlug(slug);

  if (!job) {
    notFound();
  }

  return (
    <div className="bg-neutral-0">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <nav className="mb-8">
          <Link
            href="/careers"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary-500 transition-colors hover:text-brand-primary-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to careers
          </Link>
        </nav>

        <header className="mb-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-brand-primary-200 bg-brand-primary-50 text-brand-primary-700"
            >
              {job.status}
            </Badge>
            <Badge variant="secondary">{job.area}</Badge>
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl">
            {job.title}
          </h1>
          <p className="mt-4 text-pretty text-lg text-neutral-700">{job.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="#interest-form"
              className={cn(
                buttonVariants({ size: "lg" }),
                "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              )}
            >
              Submit interest
            </Link>
            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              See product overview
            </Link>
          </div>
        </header>

        <section className="mb-10">
          <Card className="border-neutral-200 bg-neutral-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-neutral-500" />
                <CardTitle className="text-sm font-medium text-neutral-900">Role status</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  MVP placeholder
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-700">
                This is a placeholder future role for the ClaimIt MVP site. It is not an active job
                opening yet. You can submit interest through the mock form below.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">About the work</h2>
          <div className="space-y-4">
            {job.aboutTheWork.map((item) => (
              <Card key={item} className="border-neutral-200">
                <CardContent className="py-4">
                  <p className="text-neutral-700">{item}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">Responsibilities</h2>
          <Card className="border-neutral-200">
            <CardContent className="py-4">
              <ul className="space-y-3">
                {job.responsibilities.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary-500" />
                    <span className="text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">What we look for</h2>
          <Card className="border-neutral-200">
            <CardContent className="py-4">
              <ul className="space-y-3">
                {job.requirements.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                    <span className="text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">Product principles</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {productPrinciples.map((principle) => (
              <Card key={principle.title} className="border-neutral-200">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <principle.icon className="h-4 w-4 text-brand-primary-500" />
                    <CardTitle className="text-sm font-medium text-neutral-900">
                      {principle.title}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-neutral-700">{principle.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="interest-form" className="mb-10 scroll-mt-24">
          <InterestForm roleTitle={job.title} />
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">Related roles</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {job.relatedRoles.map((role) => (
              <Card
                key={role.slug}
                className="border-neutral-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Future role
                    </Badge>
                  </div>
                  <CardTitle className="text-base text-neutral-900">{role.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Link
                    href={`/careers/${role.slug}`}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "group -ml-3 text-brand-primary-500 hover:text-brand-primary-600",
                    )}
                  >
                    View role
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
