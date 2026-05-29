"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { BlogPost } from "@/lib/blog-data";
import { getRelatedPosts } from "@/lib/blog-data";
import { PostBody } from "./post-body";
import { PostCard } from "./post-card";

function formatBlogDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function BlogDetailView({ post }: { post: BlogPost }) {
  const relatedPosts = getRelatedPosts(post.slug, 3);

  return (
    <div className="bg-neutral-0">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="py-12 sm:py-16">
          <Link
            href="/blog"
            className="inline-flex items-center text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            Back to all posts
          </Link>

          <h1 className="mt-8 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
            {post.title}
          </h1>

          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
              {post.category}
            </span>
            <span aria-hidden="true">·</span>
            <span>{post.author.name}</span>
            <span aria-hidden="true">·</span>
            <span>{post.author.role}</span>
            <span aria-hidden="true">·</span>
            <span>{formatBlogDate(post.date)}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </p>
        </header>

        <div className="mb-12 aspect-[16/9] overflow-hidden rounded-lg sm:mb-16">
          {/* biome-ignore lint/performance/noImgElement: static blog cover from /public */}
          <img src={post.coverImage} alt={post.title} className="h-full w-full object-cover" />
        </div>

        <PostBody body={post.body} />

        <div className="mt-12 rounded-xl border border-neutral-200 bg-neutral-50 p-6 sm:mt-16">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-neutral-200">
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-neutral-500">
                {getInitials(post.author.name)}
              </div>
              {post.author.avatar ? (
                // biome-ignore lint/performance/noImgElement: author avatar with onError fallback to initials
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
            </div>
            <div>
              <p className="font-semibold text-neutral-900">{post.author.name}</p>
              <p className="text-sm text-neutral-600">{post.author.role}</p>
            </div>
          </div>
        </div>

        {relatedPosts.length > 0 ? (
          <section className="py-12 sm:py-16">
            <h2 className="mb-8 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              From the blog
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((related) => (
                <PostCard key={related.slug} post={related} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
