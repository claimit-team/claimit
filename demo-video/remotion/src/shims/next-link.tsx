// Stub for `next/link` — no client-side navigation in Remotion. Render
// a plain anchor so the click target keeps the right styling.
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
}

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
