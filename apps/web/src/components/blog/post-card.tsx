import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BlogPost } from "@/lib/blog-data";

interface PostCardProps {
  post: BlogPost;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
      {/* Image placeholder */}
      <div className="flex aspect-[16/10] items-center justify-center bg-neutral-100">
        <FileText className="size-10 text-neutral-400" strokeWidth={1.5} aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <Badge variant="secondary" className="mb-3 w-fit bg-neutral-100 text-neutral-600">
          {post.category}
        </Badge>

        <h3 className="text-lg font-semibold leading-snug tracking-tight text-neutral-900">
          {post.title}
        </h3>

        <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-700">{post.excerpt}</p>

        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{post.date}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readTime}</span>
          </div>

          <span className="text-xs font-medium text-neutral-400">Coming soon</span>
        </div>
      </div>
    </article>
  );
}
