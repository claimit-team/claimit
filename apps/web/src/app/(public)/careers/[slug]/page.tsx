import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CareersJobDetailView } from "@/components/careers/careers-job-detail-view";
import { getAllJobSlugs, getJobBySlug } from "@/lib/jobs-data";

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

export default async function CareerDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const job = getJobBySlug(slug);

  if (!job) {
    notFound();
  }

  return <CareersJobDetailView job={job} />;
}
