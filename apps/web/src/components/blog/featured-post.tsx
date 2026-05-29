import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { BlogPost } from "@/lib/blog-data";
import { cn } from "@/lib/utils";

interface FeaturedPostProps {
  post: BlogPost;
}

function formatBlogDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function FeaturedPost({ post }: FeaturedPostProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
    >
      <article className="grid gap-0 lg:grid-cols-2">
        <div className="aspect-[4/3] overflow-hidden bg-neutral-100 lg:aspect-auto lg:min-h-[320px]">
          {/* biome-ignore lint/performance/noImgElement: static blog cover from /public */}
          <img
            src={post.coverImage}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

        <div className="flex flex-col justify-center p-6 lg:p-10">
          <Badge variant="secondary" className="mb-4 w-fit bg-neutral-100 text-neutral-700">
            {post.category}
          </Badge>

          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-900 lg:text-3xl">
            {post.title}
          </h2>

          <p className="mt-4 leading-relaxed text-neutral-700">{post.excerpt}</p>

          <div className="mt-6 flex items-center gap-4 text-sm text-neutral-500">
            <span>{formatBlogDate(post.date)}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </div>

          <div className="mt-6">
            <span
              className={cn(
                "inline-flex items-center rounded-md border border-neutral-200 bg-neutral-0 px-4 py-2 text-sm font-medium text-neutral-900",
                "transition-colors group-hover:bg-neutral-50",
              )}
            >
              Read post
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
