import type { ButtonHTMLAttributes } from "react";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Selected chips switch to the inverted (filled) look. */
  selected?: boolean;
};

/** Outlined chip, for filters and choices. */
export function Chip({ selected = false, className = "", type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`inline-flex items-center border-rule border-line px-3 py-1 text-xs uppercase tracking-wider transition-colors ${
        selected ? "bg-ink text-paper" : "bg-transparent text-ink hover:bg-panel"
      } disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}
