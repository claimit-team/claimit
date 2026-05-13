import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BlogPost } from "@/lib/blog-data";

interface FeaturedPostProps {
  post: BlogPost;
}

export function FeaturedPost({ post }: FeaturedPostProps) {
  return (
    <article className="group overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 transition-shadow hover:shadow-md">
      <div className="grid gap-0 lg:grid-cols-2">
        {/* Image placeholder */}
        <div className="flex aspect-[4/3] items-center justify-center bg-neutral-100 lg:aspect-auto lg:min-h-[320px]">
          <FileText className="size-16 text-neutral-400" strokeWidth={1.5} aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="flex flex-col justify-center p-6 lg:p-10">
          <Badge variant="secondary" className="mb-4 w-fit bg-neutral-100 text-neutral-700">
            {post.category}
          </Badge>

          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-900 lg:text-3xl">
            {post.title}
          </h2>

          <p className="mt-4 leading-relaxed text-neutral-700">{post.excerpt}</p>

          <div className="mt-6 flex items-center gap-4 text-sm text-neutral-500">
            <span>{post.date}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </div>

          <div className="mt-6">
            <Button
              variant="outline"
              className="pointer-events-none opacity-60"
              aria-disabled="true"
            >
              Read post
              <span className="ml-2 text-xs text-neutral-500">(Coming soon)</span>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
