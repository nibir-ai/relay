export const themes = [
  "everblush",
  "onedark",
  "gruvbox",
  "nord",
  "light",
] as const;
export type Theme = (typeof themes)[number];
export const themeNames: Record<Theme, string> = {
  everblush: "Everblush",
  onedark: "One Dark",
  gruvbox: "Gruvbox",
  nord: "Nord",
  light: "Paper",
};
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem("relay-color-scheme");
    return themes.includes(value as Theme) ? (value as Theme) : "everblush";
  } catch {
    return "everblush";
  }
}
