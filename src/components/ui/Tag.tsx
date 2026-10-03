import type { HTMLAttributes } from "react";

/** Inverted label: paper text on an ink block. */
export function Tag({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center bg-ink px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-paper ${className}`}
      {...props}
    />
  );
}
