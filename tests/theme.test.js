import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { hostAppearance } from "../src/hostAppearance.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

// Compare DOM nodes with assert.ok(a === b), never assert.equal(a, b): a
// failing equal() on elements prints happy-dom's whole object graph.
function fixture(t, setup = () => {}) {
  const window = new Window({ url: "https://template.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  setup(mock.state, mock);
  mock.emit();
  const controller = new window.AbortController();
  const app = mount({
    root,
    sdk: mock.sdk,
    appearance: { settings: {} },
    signal: controller.signal,
  });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  const $ = (selector) => root.querySelector(selector);
  const opened = () =>
    mock.calls.filter((call) => call.method === "host.open").at(-1)?.value;
  return { window, root, mock, app, controller, $, opened };
}
const shown = (root) =>
  [...root.querySelectorAll(".tpl-groups .tpl-card")].map(
    (card) => card.dataset.account,
  );

test("lists only view.resultIds, grouped by service or flat", (t) => {
  const { root, mock } = fixture(t);
  assert.equal(root.querySelectorAll(".tpl-group").length, 6);
  mock.sdk.view.setMode("flat");
  assert.equal(root.querySelectorAll(".tpl-group").length, 1);
  assert.deepEqual(shown(root), mock.sdk.getSnapshot().library.view.resultIds);
  mock.sdk.view.setSort({ flatSort: "newest-first" });
  assert.deepEqual(shown(root), mock.sdk.getSnapshot().library.view.resultIds);
  assert.equal(shown(root)[0], "unicode");
});

test("searching goes through sdk.view and an empty result offers to clear it", (t) => {
  const { $, root, mock, window } = fixture(t);
  const search = $(".tpl-search-input");
  search.value = "git";
  search.dispatchEvent(new window.Event("input"));
  assert.equal(mock.sdk.getSnapshot().library.view.query, "git");
  assert.deepEqual(shown(root), ["github"]);
  mock.sdk.view.setQuery("nothing here");
  assert.equal($(".tpl-empty").hidden, false);
  assert.equal($(".tpl-empty button").dataset.action, "clear");
  $(".tpl-empty button").click();
  assert.equal(mock.sdk.getSnapshot().library.view.query, "");
  assert.equal($(".tpl-empty").hidden, true);
});

test("copying hands the exact SDK ticket back and says what was copied", async (t) => {
  const { $, mock } = fixture(t);
  // The synthetic SDK throws unless it gets its own ticket object back.
  $('[data-account="github"] [data-action="next"]').click();
  assert.deepEqual(mock.calls.at(-1), {
    method: "otp.copy",
    value: { accountId: "github", slot: "next", value: "723021" },
  });
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal($(".tpl-notice").hidden, false);
  assert.match($(".tpl-notice").textContent, /GitHub/);
});

test("each state shows its message and the host action that resolves it", (t) => {
  const cases = [
    [
      "loading",
      (s) => ((s.library.state = "loading"), (s.library.accounts = [])),
    ],
    ["empty", (s) => (s.library.accounts = [])],
    ["error", (s) => ((s.library.state = "error"), (s.library.accounts = []))],
    [
      "signed-out",
      (s) => ((s.session.state = "logged-out"), (s.library.accounts = [])),
    ],
  ];
  const expected = {
    loading: undefined,
    empty: ["host", "account-add"],
    error: ["refresh", ""],
    "signed-out": ["host", "login"],
  };
  for (const [name, setup] of cases) {
    const { $ } = fixture(t, setup);
    const action = $(".tpl-empty button");
    assert.equal($(".tpl-empty").hidden, false, name);
    assert.equal($(".tpl-groups").hidden, true, name);
    assert.deepEqual(
      action.hidden ? undefined : [action.dataset.action, action.dataset.value],
      expected[name],
      name,
    );
    // Signed out there is nothing to search, filter or sort.
    assert.equal($(".tpl-search").hidden, name === "signed-out", name);
    assert.equal($(".tpl-toolbar").hidden, name === "signed-out", name);
  }
});

test("signing out takes the search away without losing focus; signing in brings it back", (t) => {
  const { $, mock, window } = fixture(t);
  $(".tpl-search-input").focus();
  mock.state.session.state = "logged-out";
  mock.emit();
  assert.equal($(".tpl-search").hidden, true);
  assert.equal($(".tpl-toolbar").hidden, true);
  assert.ok(window.document.activeElement === $('[data-action="route"]'));
  assert.equal($(".tpl-empty button").dataset.value, "login");
  mock.state.session.state = "authenticated";
  mock.emit();
  assert.equal($(".tpl-search").hidden, false);
  assert.equal($(".tpl-toolbar").hidden, false);
  // The Manage page has no search either.
  $('[data-action="route"]').click();
  assert.equal($(".tpl-search").hidden, true);
});

test("status rows: unconfirmed session, offline queue, hidden accounts, update", (t) => {
  const { $, mock, opened } = fixture(t, (state) => {
    state.session.state = "unconfirmed";
    state.connectivity.onlineHint = false;
    state.queue.operations = [{ operationId: "q1", name: "GitHub" }];
    state.library.hidden = { count: 2, records: [] };
    state.host.updateAvailable = true;
  });
  const keys = [...$(".tpl-states").children].map((row) => row.dataset.state);
  // The development SDK reports itself as a preview with sample data.
  assert.deepEqual(keys, [
    "preview",
    "session",
    "offline",
    "hidden",
    "queue",
    "update",
  ]);
  // The host shows its own offline banner with the details; one word here.
  assert.equal($('[data-state="offline"] span').textContent, "Offline");
  assert.equal($('[data-state="offline"] button').hidden, true);
  for (const [key, value] of [
    ["session", "login"],
    ["hidden", "hidden-accounts"],
    ["queue", "offline-queue"],
  ]) {
    $(`[data-state="${key}"] button`).click();
    assert.deepEqual(opened().request, { kind: value });
  }
  // An unconfirmed session can still sign out from the menu.
  assert.ok($('.tpl-menu-entry[data-value="logout"]'));
  $('[data-state="update"] button').click();
  assert.deepEqual(mock.calls.at(-1), {
    method: "lifecycle.requestReload",
    value: "update",
  });
});

test("the account menu works with the keyboard and host dialogs return focus", (t) => {
  const { $, window, opened } = fixture(t);
  const trigger = $('[data-account="google"] [data-action="menu"]');
  const key = (target, name) =>
    target.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: name, bubbles: true }),
    );
  trigger.focus();
  key(trigger, "ArrowDown");
  const menu = $('[data-account="google"] .tpl-account-menu');
  assert.equal(menu.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.ok(window.document.activeElement === menu.firstElementChild);
  key(menu.firstElementChild, "End");
  assert.ok(window.document.activeElement === menu.lastElementChild);
  key(menu.lastElementChild, "Escape");
  assert.equal(menu.hidden, true);
  assert.ok(window.document.activeElement === trigger);
  $('[data-account="google"] [data-action="edit"]').click();
  assert.deepEqual(opened().request, {
    kind: "account-edit",
    account: { id: "google", generation: 1 },
  });
  assert.ok(opened().options.returnFocus === trigger);
});

test("the Manage page opens through the theme's own route and back", (t) => {
  const { $, window } = fixture(t);
  $('[data-action="route"]').click();
  assert.equal(window.location.hash, "#/theme/my-2fa-theme/manage");
  assert.equal($(".tpl-menu").closest(".tpl-page").hidden, false);
  assert.ok(window.document.activeElement === $(".tpl-page-title"));
  $('[data-action="route"]').click();
  assert.equal(window.location.hash, "#/theme/my-2fa-theme/accounts");
  assert.equal($(".tpl-menu").closest(".tpl-page").hidden, true);
});

test("follows the host language and colours the host dialogs once per scheme", async (t) => {
  const { $, mock } = fixture(t);
  assert.equal($(".tpl-theme").lang, "en");
  await mock.sdk.preferences.set({ language: "ja" });
  assert.equal($(".tpl-theme").lang, "ja");
  assert.equal($('[data-action="route"]').textContent, "管理");
  assert.deepEqual(mock.appearances, [hostAppearance({}, false)]);
  await mock.sdk.preferences.set({ theme: "dark" });
  mock.emit();
  assert.deepEqual(mock.appearances, [
    hostAppearance({}, false),
    hostAppearance({}, true),
  ]);
});

test("unmounting, or aborting the signal, removes everything", (t) => {
  const { root, mock, controller, app } = fixture(t);
  assert.equal(mock.listeners, 1);
  controller.abort();
  assert.equal(root.children.length, 0);
  assert.equal(mock.listeners, 0);
  app.unmount(); // a second call is harmless
});

test("the stylesheet palette matches src/hostAppearance.js", async () => {
  const css = await readFile(
    new URL("../src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  const block = (selector) =>
    css.slice(css.indexOf(selector + " {")).split("}")[0];
  for (const [selector, dark] of [
    [".tpl-theme", false],
    ['[data-theme="dark"] .tpl-theme', true],
  ]) {
    const tokens = hostAppearance({}, dark);
    const variables = [
      ...block(selector).matchAll(/--tpl-([\w-]+):\s*([^;]+);/g),
    ];
    let compared = 0;
    for (const [, name, value] of variables) {
      const key = name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
      if (typeof tokens[key] !== "string") continue;
      assert.equal(value.trim(), tokens[key], `${selector} --tpl-${name}`);
      compared += 1;
    }
    assert.ok(compared >= 17, `${selector}: ${compared} colours compared`);
  }
});

test("the stylesheets keep the accessibility basics", async () => {
  const css = (
    await Promise.all(
      ["tokens.css", "theme.css"].map((file) =>
        readFile(new URL("../src/styles/" + file, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
  assert.match(css, /\.tpl-theme \[hidden\] \{\s*display: none !important;/);
  assert.match(css, /\.tpl-theme :focus-visible \{\s*outline:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /--tpl-touch: 44px;/);
  assert.match(css, /\.tpl-names \{[^}]*min-width: 0;/);
  assert.match(css, /text-overflow: ellipsis;/);
  // A select may get narrower than its longest option, so on a phone it stays
  // in its column instead of covering the control next to it.
  assert.match(
    css,
    /\.tpl-theme \.tpl-field \{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(css, /\.tpl-theme \.tpl-select \{[^}]*\n\s+width: 100%;/);
});
