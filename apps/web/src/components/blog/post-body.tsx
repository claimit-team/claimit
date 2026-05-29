import Link from "next/link";
import type { ReactNode } from "react";
import type { BlogBlock } from "@/lib/blog-data";

function renderInlineLinks(text: string): ReactNode {
  // Match [text](url) — non-greedy on both sides
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match = regex.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, linkText, url] = match;
    const isExternal = url.startsWith("http://") || url.startsWith("https://");

    if (isExternal) {
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
        >
          {linkText}
        </a>,
      );
    } else {
      parts.push(
        <Link
          key={key++}
          href={url}
          className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
        >
          {linkText}
        </Link>,
      );
    }

    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function blockKey(block: BlogBlock, index: number): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "callout":
      return `${block.type}-${block.text.slice(0, 48)}`;
    case "list":
      return `${block.type}-${block.items.join("|").slice(0, 48)}`;
    case "image":
      return `${block.type}-${block.src}`;
    default:
      return `block-${index}`;
  }
}

export function PostBody({ body }: { body: BlogBlock[] }) {
  return (
    <>
      {body.map((block, index) => {
        const key = blockKey(block, index);
        switch (block.type) {
          case "paragraph":
            return (
              <p key={key} className="mb-6 text-lg leading-relaxed text-neutral-700">
                {renderInlineLinks(block.text)}
              </p>
            );
          case "heading":
            if (block.level === 2) {
              return (
                <h2 key={key} className="mt-12 mb-4 text-2xl font-semibold text-neutral-900">
                  {block.text}
                </h2>
              );
            }
            return (
              <h3 key={key} className="mt-8 mb-3 text-xl font-semibold text-neutral-900">
                {block.text}
              </h3>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            const listClass = block.ordered
              ? "mb-6 ml-6 list-decimal space-y-2 text-lg text-neutral-700"
              : "mb-6 ml-6 list-disc space-y-2 text-lg text-neutral-700";
            return (
              <ListTag key={key} className={listClass}>
                {block.items.map((item) => (
                  <li key={item} className="leading-relaxed">
                    {renderInlineLinks(item)}
                  </li>
                ))}
              </ListTag>
            );
          }
          case "quote":
            return (
              <blockquote
                key={key}
                className="my-8 border-l-4 border-neutral-300 pl-6 text-lg italic text-neutral-700"
              >
                {renderInlineLinks(block.text)}
                {block.cite ? (
                  <cite className="mt-2 block text-sm not-italic text-neutral-500">
                    — {block.cite}
                  </cite>
                ) : null}
              </blockquote>
            );
          case "image":
            return (
              <figure key={key} className="my-8">
                {/* biome-ignore lint/performance/noImgElement: static blog cover/inline assets from /public */}
                <img src={block.src} alt={block.alt} className="w-full rounded-lg" />
                {block.caption ? (
                  <figcaption className="mt-2 text-center text-sm text-neutral-500">
                    {block.caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          case "callout":
            if (block.tone === "warning") {
              return (
                <div
                  key={key}
                  className="my-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900"
                >
                  {renderInlineLinks(block.text)}
                </div>
              );
            }
            return (
              <div
                key={key}
                className="my-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-neutral-700"
              >
                {renderInlineLinks(block.text)}
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
