import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Runs the real 2FA importer on dist/2fa-theme.zip: the same checks an
// instance makes when you import the package (manifest, inventory, hashes,
// file types, module and CSS references, public appearance, size budget).
const hostRoot = process.env.HOST_ROOT;
if (!hostRoot)
  throw new Error(
    "Set HOST_ROOT to a 2FA host checkout with theme API 2 support, e.g. HOST_ROOT=../2fa npm run test:host",
  );
const { normalizeAppThemeImport } = await import(
  pathToFileURL(resolve(hostRoot, "src/themes/appPackage.js")).href
);
const bytes = new Uint8Array(
  await readFile(new URL("../dist/2fa-theme.zip", import.meta.url)).catch(
    () => {
      throw new Error("dist/2fa-theme.zip is missing: run npm run build first");
    },
  ),
);
const pkg = await normalizeAppThemeImport({ bytes });
console.log(
  JSON.stringify(
    {
      validator: "2FA production v2 importer",
      id: pkg.manifest.id,
      packageId: pkg.packageId,
      files: pkg.files.length,
      totalBytes: pkg.totalBytes,
    },
    null,
    2,
  ),
);
