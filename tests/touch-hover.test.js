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

// A tap on a phone leaves :hover on the control until the next tap elsewhere,
// so it looked pressed after being released. Hover styles are for mice only.
test("hover styles apply only where a pointer can hover", async () => {
  const sticky = [];
  for (const file of (await readdir(dir)).filter((name) =>
    name.endsWith(".css"),
  )) {
    for (const { prelude, within } of rules(
      await readFile(new URL(file, dir), "utf8"),
    )) {
      // :has(… :hover) inside :not() only excludes the card's own menu.
      const own = prelude.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, "");
      if (!/:hover/.test(own)) continue;
      if (
        within.some((at) => /^@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(at))
      )
        continue;
      sticky.push(`${file}: ${prelude.replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(sticky, []);
});
