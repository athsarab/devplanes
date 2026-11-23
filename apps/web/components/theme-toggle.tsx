"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    window.localStorage.setItem("devscope-theme", isDark ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))] transition hover:text-[rgb(var(--ink))]"
      aria-label="Toggle color theme"
      title="Toggle theme"
    >
      <Sun className="h-4 w-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden h-4 w-4 dark:block" aria-hidden="true" />
    </button>
  );
}
