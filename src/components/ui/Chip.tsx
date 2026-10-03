import type { ButtonHTMLAttributes } from "react";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Selected chips switch to the inverted (filled) look. */
  selected?: boolean;
};

/** Chip look, also usable on links (`<Link className={chipClassName()}>`). */
export function chipClassName(selected = false) {
  // No color transition: chips change state on hydration (e.g. the theme
  // toggle), and an animated swap reads as a flash on every page load.
  return `inline-flex items-center border-rule border-line px-3 py-1 text-xs uppercase tracking-wider ${
    selected ? "bg-ink text-paper" : "bg-transparent text-ink hover:bg-panel"
  } disabled:cursor-not-allowed disabled:opacity-40`;
}

/** Outlined chip, for filters and choices. */
export function Chip({ selected = false, className = "", type = "button", ...props }: ChipProps) {
  return <button type={type} aria-pressed={selected} className={`${chipClassName(selected)} ${className}`} {...props} />;
}
