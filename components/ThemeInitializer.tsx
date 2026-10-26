"use client";

import { useEffect } from "react";

export const THEME_STORAGE_KEY = "edgenote-theme";

export default function ThemeInitializer() {
  useEffect(() => {
    const preference = window.localStorage.getItem(THEME_STORAGE_KEY);
    const dark = preference
      ? preference === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return null;
}
