"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { BlogPost, Category } from "@/lib/blog-data";
import { blogPosts, featuredPost } from "@/lib/blog-data";
import { cn } from "@/lib/utils";
import { CategoryFilter } from "./category-filter";
import { FeaturedPost } from "./featured-post";
import { NewsletterCard } from "./newsletter-card";
import { PostCard } from "./post-card";
import { RelatedResources } from "./related-resources";

function postCardKey(post: BlogPost): string {
  return `${post.category}-${post.title}`;
}

export function BlogView() {
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");

  const filteredPosts =
    selectedCategory === "All"
      ? blogPosts
      : blogPosts.filter((post) => post.category === selectedCategory);

  return (
    <div className="bg-neutral-0">
      <section className="flex min-h-[40vh] flex-col justify-center border-b border-neutral-200 bg-neutral-0 sm:min-h-[50vh]">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-5xl">
            ClaimIt blog
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-600 sm:text-xl">
            Notes on price protection, agent workflows, user control, and building practical
            automation for post-purchase follow-through.
          </p>
          <div className="mt-8">
            <Link
              href="/how-it-works"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex items-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
              )}
            >
              See how it works
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <FeaturedPost post={featuredPost} />
        </div>
      </section>

      <section className="border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <div className="mb-8">
            <CategoryFilter
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <PostCard key={postCardKey(post)} post={post} />
            ))}
          </div>

          {filteredPosts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-neutral-500">No posts in this category yet.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <div className="grid gap-8 lg:grid-cols-2">
            <NewsletterCard />
            <RelatedResources />
          </div>
        </div>
      </section>
    </div>
  );
}
