import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => { try { return (localStorage.getItem("sgf_theme_v4") as Theme) || "light"; } catch { return "light"; } });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem("sgf_theme_v4", theme); } catch {}
  }, [theme]);

  return { theme, toggle: () => setTheme(t => t === "light" ? "dark" : "light") };
}
