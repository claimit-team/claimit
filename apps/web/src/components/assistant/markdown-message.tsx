"use client";

import { type ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function nextRevealCount(current: number, targetLen: number): number {
  if (current >= targetLen) return current;
  const step = Math.max(2, Math.ceil((targetLen - current) / 40));
  return Math.min(current + step, targetLen);
}

type MdProps = ComponentPropsWithoutRef<"p">;

const MD = {
  p: (p: MdProps) => <p className="mb-2 last:mb-0 leading-relaxed" {...p} />,
  h1: (p: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-base font-semibold mt-3 mb-1" {...p} />
  ),
  h2: (p: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-base font-semibold mt-3 mb-1" {...p} />
  ),
  h3: (p: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-sm font-semibold mt-2 mb-1" {...p} />
  ),
  ul: (p: ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc pl-5 mb-2 space-y-0.5" {...p} />
  ),
  ol: (p: ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...p} />
  ),
  li: (p: ComponentPropsWithoutRef<"li">) => <li className="leading-relaxed" {...p} />,
  strong: (p: ComponentPropsWithoutRef<"strong">) => <strong className="font-semibold" {...p} />,
  em: (p: ComponentPropsWithoutRef<"em">) => <em className="italic" {...p} />,
  a: (p: ComponentPropsWithoutRef<"a">) => (
    <a className="underline text-brand-primary-700" target="_blank" rel="noreferrer" {...p} />
  ),
  code: (p: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 text-[0.85em] font-mono" {...p} />
  ),
  pre: (p: ComponentPropsWithoutRef<"pre">) => (
    <pre className="rounded bg-neutral-100 p-2 overflow-x-auto text-xs mb-2" {...p} />
  ),
};

export function MarkdownMessage({ text, animate = false }: { text: string; animate?: boolean }) {
  const [shouldAnimate] = useState(() => animate);
  const [revealed, setRevealed] = useState(() => (animate ? 0 : text.length));
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    if (!shouldAnimate) {
      setRevealed(textRef.current.length);
      return;
    }
    const id = setInterval(() => {
      setRevealed((r) => {
        const target = textRef.current.length;
        const next = nextRevealCount(r, target);
        if (target > 0 && next >= target) clearInterval(id);
        return next;
      });
    }, 16);
    return () => clearInterval(id);
  }, [shouldAnimate]);

  const shown = shouldAnimate ? text.slice(0, revealed) : text;
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
        {shown}
      </ReactMarkdown>
    </div>
  );
}
