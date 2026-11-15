import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, setup = () => {}) {
  const window = new Window({ url: "https://template.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  setup(mock);
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const extension = () =>
    mock.sdk.host
      .listActions()
      .find((action) => action.actionId === "extension");
  return { root, mock, extension, footer: root.querySelector(".tpl-footer") };
}
const visible = (nodes) => [...nodes].filter((node) => !node.hidden);

// The theme replaces the official footer, so it carries what that showed.
test("the footer shows the 2FA version and the project links", (t) => {
  const { footer } = fixture(t);
  assert.equal(footer.hidden, false);
  assert.equal(footer.querySelector(".tpl-version").textContent, "2FA v1.13.1");
  assert.equal(footer.querySelector(".tpl-update").hidden, true);
  const links = visible(footer.querySelectorAll("a.tpl-link"));
  assert.deepEqual(
    links.map((link) => [link.textContent, link.getAttribute("href")]),
    [
      ["Documentation", "https://github.com/wuzf/2fa/blob/main/README.md"],
      ["Report an issue", "https://github.com/wuzf/2fa/issues"],
      ["Source code", "https://github.com/wuzf/2fa"],
    ],
  );
  for (const link of links) {
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener noreferrer");
  }
});

test("the browser extension opens the host's page and focus comes back to it", (t) => {
  const { footer, mock } = fixture(t);
  const button = footer.querySelector('button[data-value="extension"]');
  assert.equal(button.textContent, "Browser extension");
  button.click();
  const opened = mock.calls
    .filter((call) => call.method === "host.open")
    .at(-1);
  assert.deepEqual(opened.value.request, { kind: "extension" });
  assert.ok(opened.value.options.returnFocus === button);
});

// Signed out, the host blocks its extension page. Hiding the entry would leave
// three links, one of them alone on a phone's last line, so it stays, disabled.
test("while the host blocks the extension page the entry stays, disabled", (t) => {
  const { footer, mock, extension } = fixture(t);
  const button = footer.querySelector('button[data-value="extension"]');
  Object.assign(extension(), {
    enabled: false,
    reason: "authentication-required",
  });
  mock.emit();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, true);
  assert.equal(button.title, "Sign in");
  assert.equal(
    visible(footer.querySelector(".tpl-footer-links").children).length,
    4,
  );
  Object.assign(extension(), { enabled: true, reason: null });
  mock.emit();
  assert.equal(button.disabled, false);
  assert.equal(button.title, "");
});

test("a newer release shows a link to it, and goes when there is none", (t) => {
  const { footer, mock } = fixture(t);
  mock.state.host.about = {
    ...mock.state.host.about,
    latestVersion: "1.14.0",
    upToDate: false,
  };
  mock.emit();
  const update = footer.querySelector(".tpl-update");
  assert.equal(update.hidden, false);
  assert.equal(update.textContent, "🆕 New version available: v1.14.0");
  assert.equal(
    update.getAttribute("href"),
    "https://github.com/wuzf/2fa/releases/latest",
  );
  mock.state.host.about = { ...mock.state.host.about, latestVersion: null };
  mock.emit();
  assert.equal(update.hidden, true);
});

test("a link the host does not provide is left out", (t) => {
  const { footer, mock } = fixture(t);
  const { source: _source, ...links } = mock.state.host.about.links;
  mock.state.host.about = { ...mock.state.host.about, links };
  mock.emit();
  const shown = visible(footer.querySelectorAll("a.tpl-link")).map(
    (link) => link.textContent,
  );
  assert.deepEqual(shown, ["Documentation", "Report an issue"]);
});

test("a host without version data shows no footer", (t) => {
  const { footer } = fixture(t, (mock) => {
    mock.state.host.about = null;
  });
  assert.equal(footer.hidden, true);
});

// CSS rules with their bodies and the at-rules around them, from plain text.
function rules(css) {
  const out = [];
  const stack = [];
  let start = 0;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      stack.push({ prelude: text.slice(start, i).trim(), start: i + 1 });
      start = i + 1;
    } else if (text[i] === "}") {
      const rule = stack.pop();
      if (!rule.prelude.startsWith("@"))
        out.push({
          prelude: rule.prelude.replace(/\s+/g, " "),
          body: text.slice(rule.start, i),
          within: stack.map((item) => item.prelude),
        });
      start = i + 1;
    } else if (text[i] === ";") start = i + 1;
  }
  return out;
}

// On a phone a wrapped row left "Source code" alone on its own line. There the
// version takes a line and the four links two even columns; wide screens keep
// one row.
test("on a phone the links form two even columns under the version", async (t) => {
  const { footer } = fixture(t);
  const head = footer.querySelector(".tpl-footer-head");
  const grid = footer.querySelector(".tpl-footer-links");
  assert.deepEqual(
    [...footer.children].map((node) => node.className),
    ["tpl-footer-head", "tpl-footer-links"],
  );
  assert.deepEqual(
    [...head.children].map((node) => node.className),
    ["tpl-version", "tpl-link tpl-update"],
  );
  assert.deepEqual(
    visible(grid.children).map((node) => node.textContent),
    ["Documentation", "Browser extension", "Report an issue", "Source code"],
  );
  const all = rules(
    await readFile(new URL("../src/styles/theme.css", import.meta.url), "utf8"),
  );
  const body = (prelude, media) =>
    all.find(
      (rule) =>
        rule.prelude === prelude &&
        (media ? rule.within.includes(media) : !rule.within.length),
    )?.body ?? "";
  const phone = "@media (max-width: 600px)";
  assert.match(body(".tpl-theme .tpl-footer"), /display: flex;/);
  assert.match(
    body(".tpl-theme .tpl-footer-head, .tpl-theme .tpl-footer-links"),
    /display: flex;/,
  );
  assert.match(body(".tpl-theme .tpl-footer", phone), /display: grid;/);
  const links = body(".tpl-theme .tpl-footer-links", phone);
  assert.match(links, /display: grid;/);
  assert.match(links, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  // A button dressed as a link loses the browser's button look.
  assert.match(body(".tpl-theme button.tpl-link"), /border: 0;/);
  assert.match(body(".tpl-theme button.tpl-link"), /background: none;/);
});
