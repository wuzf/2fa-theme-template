import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import { createPublicAppearance } from "../scripts/publicAppearance.js";
import { hostAppearance } from "../src/hostAppearance.js";
import { theme } from "../theme.config.js";

const buildScript = fileURLToPath(
  new URL("../scripts/build.js", import.meta.url),
);
// Builds into a temporary folder, so dist/ is left alone.
const output = await mkdtemp(join(tmpdir(), "2fa-theme-package-"));
after(() => rm(output, { recursive: true, force: true }));
const archivePath = join(output, "2fa-theme.zip");
const build = () =>
  execFileSync(process.execPath, [buildScript, "--out-dir", output], {
    stdio: "pipe",
  });
build();

test("the package lists exactly its files, with true sizes and hashes", async () => {
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const manifest = JSON.parse(
    new TextDecoder().decode(archive["2fa-theme.json"]),
  );
  assert.equal(manifest.themeApiVersion, 2);
  assert.equal(manifest.kind, "app");
  assert.equal(manifest.sdkApiVersion, 1);
  assert.equal(manifest.id, theme.id);
  assert.equal(manifest.version, theme.version);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(-[\w.]+)?$/);
  assert.equal(Object.keys(archive).length, manifest.files.length + 1);
  for (const file of manifest.files) {
    assert.ok(archive[file.path], file.path);
    assert.equal(archive[file.path].length, file.size);
    assert.equal(
      createHash("sha256").update(archive[file.path]).digest("hex"),
      file.sha256,
    );
  }
  for (const path of [manifest.entry, ...manifest.styles])
    assert.ok(archive[path], path);
});

test("the package holds the theme, its licence and its public colours, nothing else", async () => {
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  const paths = Object.keys(archive);
  // No development shell, tests, scripts, HTML or source maps.
  assert.ok(
    !paths.some((path) => /^(dev|tests|scripts)\/|\.(html|map)$/.test(path)),
    paths.join(", "),
  );
  assert.deepEqual(
    Buffer.from(archive["licenses/LICENSE.txt"]),
    await readFile(new URL("../LICENSE", import.meta.url)),
  );
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(archive["public-appearance.json"])),
    createPublicAppearance(),
  );
  // Everything the code loads is in the package: no CDN or remote URLs.
  for (const path of paths.filter((name) => /\.(js|css)$/.test(name))) {
    const source = new TextDecoder().decode(archive[path]);
    assert.doesNotMatch(source, /(import|url)\s*\(\s*["']?https?:/, path);
    assert.doesNotMatch(source, /from\s+["']https?:/, path);
  }
});

test("building twice gives the same bytes", async () => {
  const before = await readFile(archivePath);
  build();
  assert.deepEqual(await readFile(archivePath), before);
});

const host = process.env.HOST_ROOT ? test : test.skip;
host(
  "the real 2FA importer accepts the package and its public colours",
  async () => {
    const { normalizeAppThemeImport, normalizeAppAppearance } = await import(
      pathToFileURL(resolve(process.env.HOST_ROOT, "src/themes/appPackage.js"))
        .href
    );
    const { resolvePublicAppearance } = await import(
      pathToFileURL(
        resolve(process.env.HOST_ROOT, "src/themes/publicAppearance.js"),
      ).href
    );
    const pkg = await normalizeAppThemeImport({
      bytes: new Uint8Array(await readFile(archivePath)),
    });
    assert.equal(pkg.manifest.id, theme.id);
    assert.match(pkg.packageId, /^[0-9a-f]{64}$/);
    assert.deepEqual(pkg.publicAppearanceDescriptor, createPublicAppearance());
    // Every combination of setting values.
    const combinations = theme.settings.reduce(
      (current, field) =>
        current.flatMap((settings) =>
          (field.type === "boolean"
            ? [false, true]
            : field.options?.map(({ value }) => value) || [field.default]
          ).map((value) => ({ ...settings, [field.key]: value })),
        ),
      [{}],
    );
    for (const settings of combinations) {
      const result = resolvePublicAppearance(pkg, settings);
      assert.deepEqual(result.light, hostAppearance(settings, false));
      assert.deepEqual(result.dark, hostAppearance(settings, true));
      const normalized = await normalizeAppAppearance(pkg, { settings });
      assert.deepEqual(normalized.appearance.publicAppearance, result);
    }
  },
);
