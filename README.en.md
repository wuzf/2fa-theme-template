# 2FA theme template

[简体中文](README.md)

A starter template for **complete frontend themes** for [2FA](https://github.com/wuzf/2fa) (v2 "app" themes: `themeApiVersion: 2`, `kind: "app"`, SDK API 1). It is already a theme you can install and use: the account list (grouped or flat, search, sort, service filter), copying the current and the next code, the countdown, HOTP counters and what can go wrong with them, a menu for each account, a Manage page, every status message, the version and project links, 15 languages, light and dark, and keyboard use. Its look is deliberately plain so you can make it your own.

Requires 2FA 2.0.0 or later.

## 1. Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [git](https://git-scm.com/)

## 2. Create your own repository

Open this template on GitHub and choose **Use this template → Create a new repository**, or clone it:

```sh
git clone https://github.com/wuzf/2fa-theme-template my-2fa-theme
cd my-2fa-theme
```

Then replace `Copyright (c) 2026 2FA Theme Contributors` in `LICENSE` with your own name.

## 3. Install the dependencies

```sh
npm ci
```

## 4. Open the development shell

```sh
npm run dev
```

Open <http://127.0.0.1:4201> (use `PORT=4300 npm run dev` if the port is taken). The shell runs on **synthetic data**: sample accounts, a simulated clock, calls that are only logged (nothing is really copied or saved), and host texts in English only. It is quick for working on the layout, but it is not a real installation: always finish with a real instance (step 10).

The links at the top switch to dark, Chinese or compact, and to the loading, empty, failed, signed-out, unconfirmed sign-in, offline with pending changes, hidden accounts and unchecked HOTP states. You can also add parameters to the address, for example `?state=offline&scheme=dark&lang=zh-CN`.

## 5. Project layout: what to edit

| Path                    | Purpose                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `theme.config.js`       | The theme manifest: id, name, version, author, description, style files and theme settings. **Start here.**                              |
| `src/theme.js`          | The whole interface: page structure, account cards, status messages, events. Places marked `Customise:` are meant to be changed.         |
| `src/menu.js`           | Which groups the Manage page has, which host features each group holds, and in which order. Edit this file for a menu in your own style. |
| `src/i18n.js`           | The theme's own words (15 languages), and the host text keys it uses with English fallbacks.                                             |
| `src/hostAppearance.js` | Colours, corners and fonts for the host's own dialogs, menus and toasts; keep it in step with `tokens.css`.                              |
| `src/styles/tokens.css` | Variables for colours, fonts and spacing, one set for light and one for dark.                                                            |
| `src/styles/theme.css`  | Layout and components.                                                                                                                   |
| `dev/`                  | The development shell; never packaged.                                                                                                   |
| `scripts/`              | Build, development server, host validation and test scripts.                                                                             |
| `tests/`                | Tests.                                                                                                                                   |

A good first round of changes:

1. In `theme.config.js`, change `id`, `name`, `author` and `description`; start `version` at `0.1.0`. Never change the `id` after publishing: it names the theme series.
2. Change the route `#/theme/my-2fa-theme/` in `src/theme.js` to `#/theme/your-id/`, and the `name` in `package.json`.
3. Put your colours in `src/styles/tokens.css` and `src/hostAppearance.js` (both places; a test compares them).
4. You may replace the class prefix `tpl-` with your own; change it in the JS, the CSS and the tests together.

## 6. Rules that get a theme rejected or broken

- **Never compute codes yourself.** Show only `otp.current` / `otp.next` from the snapshot. To copy, call `sdk.otp.readCopyTarget()` and `sdk.otp.copy()` in the same click with no `await` in between, and pass the ticket back unchanged: never cache, clone or build one.
- **Every change goes through the host.** Adding, editing, deleting, import and export, settings, signing in and out: open the host dialog with `sdk.host.open()`. Never call `/api/` yourself.
- **Never retry HOTP by yourself.** When an outcome is unknown or needs a check, show the state and let the user press "Check counter state" (`sdk.otp.reconcile()`).
- **No remote resources.** No CDNs, remote fonts, images, CSS or JS; bundle every dependency into the theme. A package may contain only JS, CSS, JSON, PNG, JPEG, WebP, GIF, WOFF2 and TXT files under `licenses/`: no HTML, SVG or source maps.
- **The package is public.** Every file in it can be read once published: no keys, tokens or personal data.
- **Keep styles inside the theme root** (`.tpl-theme`) so the host's dialogs are untouched. Write `:hover` only inside `@media (hover: hover)`, each with an `:active` twin of the same selector inside `@media (hover: none)`; keep `[hidden] { display: none !important }` and a visible `:focus-visible`.
- **15 languages.** The theme's own words come in all 15 languages; names of host features come from `sdk.i18n.t(key)`.
- **A theme setting's label is one string.** v2 settings cannot be translated per language, so write both, as in `"信息密度 / Density"`.
- **Use only your own routes**, `#/theme/<id>/...`. Do not register a Service Worker, clear caches or call `location.reload()`; ask for a reload with `sdk.lifecycle.requestReload()`.
- An unconfirmed sign-in and a signed-out session must show their sign-in entry; never fake a state with sample data.

## 7. Tests

```sh
npm test
```

`npm test` runs every file in `tests/` in its own process, one after another, each limited to 512 MB of memory and 180 seconds. Do not run the whole folder at once with `node --test tests/`: when a comparison of two DOM elements fails, Node prints happy-dom's entire object graph and memory runs out fast. To run only the files whose names contain some text (with the same limits):

```sh
npm test -- menu-order
```

Or run one file directly, with the memory cap:

```sh
node --max-old-space-size=512 --test tests/menu-order.test.js
```

In your own tests, compare DOM elements with `assert.ok(a === b)`, not `assert.equal(a, b)`.

Without `HOST_ROOT`, the tests that need the host project show as skipped (see step 9). Check formatting with `npm run format:check`; format with `npm run format`.

## 8. Build

```sh
npm run build
```

The output is `dist/2fa-theme.zip` (the theme package), `dist/2fa-theme.zip.sha256` and `dist/2fa-theme.json` (the manifest). The build lists every file with its size and SHA-256 from the real bytes, and the same sources always give the same ZIP. Everything under `src/` is packaged; put fonts and pictures in `assets/` and their licenses in `licenses/`, and the build includes them. `LICENSE` is packaged as `licenses/LICENSE.txt`.

## 9. Validate with the host project

Clone the 2FA project next to the template and install its dependencies:

```sh
git clone https://github.com/wuzf/2fa ../2fa
npm ci --prefix ../2fa
```

Then check the package with the host's real importer and run the tests against the real host script:

```sh
HOST_ROOT=../2fa npm run test:host
HOST_ROOT=../2fa npm test
```

In Windows PowerShell:

```powershell
$env:HOST_ROOT = '../2fa'
npm run test:host
npm test
```

When `test:host` passes it prints the theme id and the `packageId` (a hash of the package contents).

## 10. The real check: import it into your instance

Once all of the above passes, open your own 2FA instance: **Appearance and themes → Import theme** (外观与主题 → 导入主题) and choose `dist/2fa-theme.zip`. After installing, preview it (sample data, valid for 5 minutes), then press **Apply appearance** (应用外观). Then check at least:

- widths 320 / 390 / 768 / 1440, light and dark, long names, a few languages;
- grouped and flat, every sort order, search and the service filter;
- copying the current and the next code, copying and checking a HOTP account;
- that every account menu and Manage entry really opens, keyboard use, and focus going back after a dialog closes;
- saving an edit, the pending-changes message after going offline, signing out and in again;
- if something goes wrong, `https://your-domain/?safeMode=1` turns the theme off for the moment.

## 11. Publish

There are two ways to publish; pick either:

- **Your own catalog**: a public GitHub repository with `catalog.json` at the root of its `main` branch and the package at `themes/<id>/2fa-theme.zip` (the same structure as the official catalog, whose `npm run catalog` can generate the index). Users add `owner/repository` under **Appearance and themes → Theme catalogs** and can then install it.
- **The official community catalog**: open a PR to [wuzf/2fa-theme-mytheme](https://github.com/wuzf/2fa-theme-mytheme) following its CONTRIBUTING.md, with `2fa-theme.zip`, `theme.json` and `LICENSE` in `themes/<id>/`.

## 12. Update your theme

Keep the same `id`, raise `version` in `theme.config.js` (SemVer, e.g. `0.1.0` → `0.2.0`), build again, then import it again or update the package in your catalog. A new package with the same id replaces the installed one. Keep each setting's `key` and type where you can so users keep their settings; adding new `capabilities` stops 2FA from updating the theme automatically.

## 13. Full reference

- [Complete frontend themes and SDK API 1 (THEME_APP_SDK.md)](https://github.com/wuzf/2fa/blob/main/docs/THEME_APP_SDK.md): the mount interface, package format, SDK snapshot and methods, host entry points and the pre-release checklist.
- [Custom themes and appearance (THEMES.md)](https://github.com/wuzf/2fa/blob/main/docs/THEMES.md): installing, theme catalogs, automatic updates and safe mode.

## License

The template is released under the [MIT](LICENSE) license. Once you use it, put your own name as the copyright holder in `LICENSE`; fonts, pictures and other third-party assets you add need their own licenses, placed in `licenses/`.
