// Stub for `@/components/assistant/markdown-message`. The real one
// renders react-markdown with remark-gfm; for a still frame we just
// dump the raw text — preserves the message bubble layout.
import type { ReactNode } from "react";

interface Props {
  /** The real component's primary prop is `text`. */
  text?: string;
  /** Legacy alias accepted for safety. */
  content?: string;
  /** Streaming flag — we don't animate; render plainly. */
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}

export function MarkdownMessage({ text, content, className }: Props) {
  return (
    <div className={className} style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>
      {text ?? content ?? ""}
    </div>
  );
}

export default MarkdownMessage;
