import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { theme } from "../theme.config.js";
import { createPublicAppearance } from "./publicAppearance.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out-dir" || !args[1]))
  throw new Error("Usage: node scripts/build.js [--out-dir <directory>]");
const output = args.length ? resolve(args[1]) : resolve(root, "dist");
// The only file types a v2 package may contain (.txt only under licenses/).
const mime = {
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  woff2: "font/woff2",
  txt: "text/plain",
};
const entries = {};
async function add(path, data) {
  entries[path] = new Uint8Array(data);
  const target = resolve(output, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}
async function collect(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else await add(path, await readFile(resolve(root, path)));
  }
}
async function exists(path) {
  return stat(resolve(root, path)).then(
    () => true,
    () => false,
  );
}
await mkdir(output, { recursive: true });
// Everything under src/ ships. Fonts and pictures go in assets/, their
// licenses in licenses/; both folders are optional.
await collect("src");
for (const folder of ["assets", "licenses"])
  if (await exists(folder)) await collect(folder);
if (theme.preview)
  await add(theme.preview, await readFile(resolve(root, theme.preview)));
await add(
  "public-appearance.json",
  Buffer.from(JSON.stringify(createPublicAppearance(), null, 2) + "\n"),
);
await add("licenses/LICENSE.txt", await readFile(resolve(root, "LICENSE")));
const files = Object.entries(entries)
  .sort(([a], [b]) => a.localeCompare(b, "en"))
  .map(([path, bytes]) => ({
    path,
    mime: mime[path.split(".").pop()],
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
const unsupported = files.find((file) => !file.mime);
if (unsupported)
  throw new Error(`Unsupported packaged file: ${unsupported.path}`);
const manifest = { ...theme, files };
await add(
  "2fa-theme.json",
  Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
);
const archive = zipSync(
  Object.fromEntries(
    Object.entries(entries).map(([name, bytes]) => [
      name,
      [bytes, { mtime: new Date("2026-01-01T00:00:00Z") }],
    ]),
  ),
  { level: 6 },
);
await writeFile(resolve(output, "2fa-theme.zip"), archive);
const digest = createHash("sha256").update(archive).digest("hex");
await writeFile(
  resolve(output, "2fa-theme.zip.sha256"),
  digest + "  2fa-theme.zip\n",
);
console.log(
  JSON.stringify(
    {
      archive: relative(root, resolve(output, "2fa-theme.zip"))
        .split(sep)
        .join("/"),
      files: files.length + 1,
      bytes: archive.length,
      sha256: digest,
    },
    null,
    2,
  ),
);
