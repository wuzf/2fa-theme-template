import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const dir = new URL("../src/styles/", import.meta.url);

// Rule preludes with the at-rules around them, from plain CSS text.
function rules(css) {
  const out = [];
  const stack = [];
  let start = 0;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      const prelude = text.slice(start, i).trim();
      stack.push(prelude);
      if (!prelude.startsWith("@"))
        out.push({ prelude, within: stack.slice(0, -1) });
      start = i + 1;
    } else if (text[i] === "}") {
      stack.pop();
      start = i + 1;
    } else if (text[i] === ";") start = i + 1;
  }
  return out;
}
const selectors = (prelude) =>
  prelude
    .split(/,(?![^()]*\))/)
    .map((selector) => selector.replace(/\s+/g, " ").trim());
const within = (rule, hover) =>
  rule.within.some((at) =>
    new RegExp(`^@media[^{]*\\(\\s*hover\\s*:\\s*${hover}\\s*\\)`).test(at),
  );

// The browser's tap highlight is a square over rounded controls. It is off;
// a press on a touch screen shows the control's own hover look instead, in
// its own shape, and the look goes away on release.
test("on touch screens a press shows the hover look instead of a square highlight", async () => {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".css"));
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, dir), "utf8")),
  );
  assert.match(
    sources.join("\n"),
    /\.tpl-theme \{\s*-webkit-tap-highlight-color: transparent;/,
  );
  const all = sources.flatMap((css, i) =>
    rules(css).map((rule) => ({ ...rule, file: files[i] })),
  );
  const pressed = new Set(
    all
      .filter((rule) => within(rule, "none"))
      .flatMap((rule) => selectors(rule.prelude)),
  );
  const missing = [];
  for (const rule of all.filter((rule) => within(rule, "hover")))
    for (const selector of selectors(rule.prelude)) {
      const own = selector.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, "");
      if (!/:hover/.test(own)) continue;
      if (!pressed.has(selector.replace(/:hover/g, ":active")))
        missing.push(`${rule.file}: ${selector}`);
    }
  assert.deepEqual(missing, []);
});
