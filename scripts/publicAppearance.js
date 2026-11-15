import { hostAppearance } from "../src/hostAppearance.js";
import { theme } from "../theme.config.js";

// Settings (boolean or select only) whose values change hostAppearance(), for
// example an accent colour. The template's density setting changes nothing
// there, so the list is empty.
const publicSettings = [];

/** Build-time data only: the sign-in page, first-time setup and public OTP
    pages use these colours without loading the theme's JavaScript or CSS. */
export function createPublicAppearance() {
  const defaults = Object.fromEntries(
    theme.settings.map(({ key, default: value }) => [key, value]),
  );
  const baseline = {
    light: hostAppearance(defaults, false),
    dark: hostAppearance(defaults, true),
  };
  const variants = publicSettings.map((key) => {
    const field = theme.settings.find((setting) => setting.key === key);
    if (!field || !["boolean", "select"].includes(field.type))
      throw new Error(`Unsupported public appearance setting: ${key}`);
    const values =
      field.type === "boolean"
        ? [false, true]
        : field.options.map(({ value }) => value);
    return {
      setting: key,
      values: Object.fromEntries(
        values.map((value) => [
          String(value),
          Object.fromEntries(
            ["light", "dark"].map((mode) => [
              mode,
              Object.fromEntries(
                Object.entries(
                  hostAppearance(
                    { ...defaults, [key]: value },
                    mode === "dark",
                  ),
                ).filter(
                  ([token, next]) =>
                    JSON.stringify(next) !==
                    JSON.stringify(baseline[mode][token]),
                ),
              ),
            ]),
          ),
        ]),
      ),
    };
  });
  return {
    formatVersion: 1,
    ...baseline,
    // A bundled font for those pages, e.g.
    // { family: "My Theme Text", path: "assets/my-font.woff2", weight: 400, style: "normal" }
    // The path must be a .woff2 file that the build packs from assets/.
    fonts: [],
    variants,
  };
}
