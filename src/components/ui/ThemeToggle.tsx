"use client";

import { useSyncExternalStore } from "react";
import { Chip } from "./Chip";

type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];
const LABELS: Record<Theme, string> = { system: "Auto", light: "Clair", dark: "Sombre" };

const listeners = new Set<() => void>();

function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <div role="group" aria-label="Thème" className="flex">
      {THEMES.map((t, i) => (
        <Chip key={t} selected={theme === t} onClick={() => setTheme(t)} className={i > 0 ? "-ml-[1.5px]" : ""}>
          {LABELS[t]}
        </Chip>
      ))}
    </div>
  );
}
