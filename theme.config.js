// The theme manifest. scripts/build.js adds the file list (sizes and SHA-256
// hashes of the real output bytes) and writes it as 2fa-theme.json.
export const theme = {
  // Fixed values for a complete (v2 "app") theme. Do not change them.
  themeApiVersion: 2,
  kind: "app",
  sdkApiVersion: 1,
  // Change these. The id names your theme for good: 1–64 letters, digits,
  // "_" or "-", not starting with "builtin-". An update keeps the same id and a
  // higher SemVer version.
  id: "my-2fa-theme",
  name: "My Theme",
  version: "0.1.0",
  author: "Your Name",
  description: "A plain, accessible starting point for a complete 2FA theme.",
  // Optional: the oldest 2FA version (SemVer) your theme supports; older
  // versions refuse to preview or apply it.
  // minHostVersion: "2.0.0",
  // Optional: a 16:10 screenshot (640×400 is a good size) shown on the theme
  // card. Put preview.webp next to this file and uncomment the line; use sample
  // data only, never real accounts.
  // preview: "preview.webp",
  entry: "src/theme.js",
  // Loaded in this order. Keep every rule inside .tpl-theme.
  styles: ["src/styles/tokens.css", "src/styles/theme.css"],
  // Descriptive only (not permissions). Adding a new one later stops 2FA from
  // updating your theme automatically, so list what you use from the start.
  capabilities: ["accounts", "host-flows", "preferences"],
  // Settings shown under 外观与主题 → 主题设置 (Appearance and themes → Theme
  // settings); src/theme.js reads them in applySettings(). Labels are single
  // strings in v2 (no per-language translations), so use the "中文 / English"
  // pattern. Types: boolean, color, number, select, text, textarea. Keep a
  // setting's key and type across versions so users keep their choice.
  settings: [
    {
      key: "density",
      type: "select",
      label: "信息密度 / Density",
      default: "comfortable",
      options: [
        { value: "comfortable", label: "舒适 / Comfortable" },
        { value: "compact", label: "紧凑 / Compact" },
      ],
    },
  ],
};
