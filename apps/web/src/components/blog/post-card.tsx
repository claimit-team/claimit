import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { BlogPost } from "@/lib/blog-data";

interface PostCardProps {
  post: BlogPost;
}

function formatBlogDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function PostCard({ post }: PostCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
    >
      <article className="flex h-full flex-col">
        <div className="aspect-[16/10] overflow-hidden bg-neutral-100">
          {/* biome-ignore lint/performance/noImgElement: static blog cover from /public */}
          <img
            src={post.coverImage}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <Badge variant="secondary" className="mb-3 w-fit bg-neutral-100 text-neutral-600">
            {post.category}
          </Badge>

          <h3 className="text-lg font-semibold leading-snug tracking-tight text-neutral-900">
            {post.title}
          </h3>

          <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-700">{post.excerpt}</p>

          <div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
            <span>{formatBlogDate(post.date)}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
