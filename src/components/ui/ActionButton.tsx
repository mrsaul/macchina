import type { ButtonHTMLAttributes } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Stretch to the full width of the container. */
  block?: boolean;
};

/** Primary action: solid ink block, paper text. */
export function ActionButton({ block = false, className = "", type = "button", ...props }: ActionButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 border-rule border-ink bg-ink px-5 py-3 text-sm font-bold uppercase tracking-wider text-paper transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink disabled:hover:text-paper ${
        block ? "w-full" : ""
      } ${className}`}
      {...props}
    />
  );
}
