import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  hostKeys,
  hostText,
  languages,
  themeStrings,
  themeText,
} from "../src/i18n.js";
import { groups, labelOverrides } from "../src/menu.js";

const placeholders = (text) =>
  [...text.matchAll(/\{\w+\}/g)].map(String).sort();

test("all 15 languages have every string, filled in, with the same placeholders", () => {
  assert.equal(languages.length, 15);
  assert.deepEqual(Object.keys(themeStrings).sort(), [...languages].sort());
  const keys = Object.keys(themeStrings.en).sort();
  for (const language of languages) {
    const strings = themeStrings[language];
    assert.deepEqual(Object.keys(strings).sort(), keys, language);
    for (const key of keys) {
      assert.equal(typeof strings[key], "string", `${language}.${key}`);
      assert.ok(strings[key].trim(), `${language}.${key} is empty`);
      assert.deepEqual(
        placeholders(strings[key]),
        placeholders(themeStrings.en[key]),
        `${language}.${key}`,
      );
    }
  }
  // Every language but English has its own words, not a copy of English.
  for (const language of languages.filter((code) => code !== "en"))
    assert.notDeepEqual(themeStrings[language], themeStrings.en, language);
});

test("every string the theme asks for exists", async () => {
  const source = await readFile(
    new URL("../src/theme.js", import.meta.url),
    "utf8",
  );
  // text("key") is the theme's own string, t("key") a host string.
  const calls = (name) =>
    [
      ...source.matchAll(new RegExp(`\\b${name}\\(\\s*"(\\w+)"\\s*[,)]`, "g")),
    ].map((match) => match[1]);
  for (const key of calls("text"))
    assert.ok(key in themeStrings.en, `theme string ${key}`);
  for (const group of groups) {
    const key = "group" + group[0].toUpperCase() + group.slice(1);
    assert.ok(key in themeStrings.en, `menu group name ${key}`);
  }
  for (const key of calls("t")) assert.ok(key in hostKeys, `host key ${key}`);
  // Host keys also sit in tables (account menu, sorts, messages): every
  // camelCase string in theme.js is a known key or a view field.
  const viewFields = ["flatSort", "groupedItemSort", "groupSort"];
  for (const [, key] of source.matchAll(/"([a-z][a-z0-9]*[A-Z]\w*)"/g))
    assert.ok(
      key in hostKeys || key in themeStrings.en || viewFields.includes(key),
      key,
    );
  for (const key of Object.values(labelOverrides))
    assert.ok(key in hostKeys, `menu label ${key}`);
  // …and the list holds no leftovers.
  const quoted = new Set([...source.matchAll(/"(\w+)"/g)].map((m) => m[1]));
  for (const key of Object.keys(hostKeys))
    assert.ok(
      quoted.has(key) || Object.values(labelOverrides).includes(key),
      `unused host key ${key}`,
    );
});

test("strings fall back to English and fill their placeholders", () => {
  assert.equal(themeText("xx", "manage"), "Manage");
  assert.equal(themeText("de", "secondsLeft", { seconds: 7 }), "7 s");
  const sdk = { i18n: { t: (key) => (key === "retry" ? "Erneut" : key) } };
  assert.equal(hostText(sdk, "retry"), "Erneut");
  // A host that does not know a key returns the key: use the fallback.
  assert.equal(
    hostText(sdk, "offlineQueueCount", { count: 2 }),
    "2 unsynced change(s)",
  );
});

const host = process.env.HOST_ROOT ? test : test.skip;
host("the language list matches the host's", async () => {
  const { SUPPORTED_LANGUAGES } = await import(
    pathToFileURL(resolve(process.env.HOST_ROOT, "src/shared/languages.js"))
      .href
  );
  assert.deepEqual([...SUPPORTED_LANGUAGES], languages);
});
