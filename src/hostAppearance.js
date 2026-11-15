/** Colours, corners and fonts for the host's own dialogs, menus and toasts,
    and (through scripts/publicAppearance.js) for the sign-in and public OTP
    pages. Change the values to match your palette: they mirror the
    --tpl-* variables in src/styles/tokens.css, and tests/theme.test.js fails
    when the two drift apart. Colours are #RGB/#RRGGBB (with optional alpha);
    radius 0–24, controlRadius 0–16 and borderWidth 1–3 are plain numbers (px).
    The host uses `accent` both as text and as a button fill, so keep it
    readable on `surface`. */
export function hostAppearance(_settings = {}, dark = false) {
  return {
    surface: dark ? "#1f232a" : "#ffffff",
    subtle: dark ? "#171a1f" : "#f4f5f7",
    hover: dark ? "#2c313a" : "#e9ebef",
    text: dark ? "#e8eaee" : "#1d2127",
    muted: dark ? "#a7aeba" : "#5b6370",
    line: dark ? "#3a404b" : "#d5d9e0",
    stroke: dark ? "#6f7785" : "#8b93a0",
    accent: dark ? "#8fb3ff" : "#2257c5",
    accentHover: dark ? "#adc7ff" : "#1b469f",
    accentText: dark ? "#10203f" : "#ffffff",
    selected: dark ? "#26365a" : "#e3ebfa",
    danger: dark ? "#ffb4ab" : "#b3261e",
    dangerBackground: dark ? "#4a2522" : "#fce8e6",
    dangerFill: dark ? "#ffb4ab" : "#b3261e",
    dangerFillHover: dark ? "#ffcfc9" : "#8c1d18",
    dangerText: dark ? "#3b0a07" : "#ffffff",
    warning: dark ? "#f0c75e" : "#7a5900",
    warningBackground: dark ? "#3d3218" : "#fdf3d7",
    success: dark ? "#8fd6a4" : "#1e6b3a",
    successBackground: dark ? "#1e3a28" : "#e3f2e8",
    radius: 12,
    controlRadius: 8,
    borderWidth: 1,
    shadow: { x: 0, y: 4, blur: 16, spread: 0, color: "#0000002e" },
    controlShadow: null,
    fontFamily: [
      "system-ui",
      "-apple-system",
      "Segoe UI",
      "Roboto",
      "PingFang SC",
      "Microsoft YaHei",
      "sans-serif",
    ],
  };
}
