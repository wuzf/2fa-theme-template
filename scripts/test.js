import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Runs each tests/*.test.js in its own Node process with a memory cap and a
// time limit. A failing assertion that compares two DOM elements makes Node
// print a diff of happy-dom's huge object graph, which can use up all memory;
// one file at a time with a cap keeps that from taking the machine down.
// Only some files: npm test -- menu-order (matches parts of file names).
const folder = fileURLToPath(new URL("../tests/", import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(folder)
  .filter((name) => name.endsWith(".test.js"))
  .filter((name) => !only.length || only.some((part) => name.includes(part)))
  .sort();
const failed = [];
for (const name of files) {
  const run = spawnSync(
    process.execPath,
    ["--max-old-space-size=512", "--test", "--test-reporter=dot", name],
    { cwd: folder, stdio: "inherit", timeout: 180_000 },
  );
  const ok = run.status === 0;
  console.log(
    `${ok ? "pass" : "FAIL"}  ${name}${run.error ? ` (${run.error.code})` : ""}`,
  );
  if (!ok) failed.push(name);
}
console.log(
  `\n${files.length - failed.length}/${files.length} test files passed`,
);
if (!process.env.HOST_ROOT)
  console.log("HOST_ROOT is not set: the real-host tests were skipped.");
process.exitCode = failed.length ? 1 : 0;
