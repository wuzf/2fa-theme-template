import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mount } from "../src/theme.js";
import { buildMenu } from "../src/menu.js";
import { createSyntheticSdk } from "../dev/synthetic-sdk.js";

function fixture(t, configure = () => {}) {
  const window = new Window({ url: "https://template.test/" });
  const root = window.document.createElement("div");
  window.document.body.append(root);
  const mock = createSyntheticSdk();
  mock.state.host.installAvailable = true;
  configure(mock);
  mock.emit();
  const app = mount({ root, sdk: mock.sdk, appearance: { settings: {} } });
  t.after(async () => {
    app.unmount();
    await window.happyDOM.abort();
  });
  // [group name, entries as action ids ("scheme" for the light/dark switch)]
  const menu = () =>
    [...root.querySelectorAll(".tpl-menu-group")].map((group) => [
      group.querySelector(".tpl-menu-title").textContent,
      [...group.querySelector(".tpl-menu-list").children].map(
        (node) => node.dataset.value || node.dataset.action,
      ),
    ]);
  const labels = () =>
    [...root.querySelectorAll(".tpl-menu-list > *")].map(
      (node) => (node.querySelector("span") || node).textContent,
    );
  return { root, mock, menu, labels };
}
const extra = (actionId) => ({
  actionId,
  labelKey: actionId,
  requires: null,
  enabled: true,
  reason: null,
  request: { kind: "future" },
});

test("the groups and their entries follow src/menu.js", (t) => {
  const { menu } = fixture(t);
  assert.deepEqual(menu(), [
    [
      "Accounts & data",
      ["scan-import", "account-add", "import", "export", "backup"],
    ],
    ["Tools", ["tools", "quick-otp"]],
    [
      "Settings",
      [
        "scheme",
        "settings:security",
        "settings:sync",
        "settings:preferences",
        "settings:custom-code",
        "appearance",
        "settings:about",
      ],
    ],
    ["App", ["extension", "pwa-install", "logout"]],
  ]);
});

test("the light/dark switch opens settings and About follows the theme settings", (t) => {
  const { menu } = fixture(t);
  const settings = Object.fromEntries(menu()).Settings;
  assert.equal(settings[0], "scheme");
  assert.equal(
    settings.indexOf("settings:about"),
    settings.indexOf("appearance") + 1,
  );
});

test("signing out, or in, is the last entry of the whole menu", (t) => {
  const { menu, mock } = fixture(t);
  assert.equal(menu().at(-1)[1].at(-1), "logout");
  mock.state.session.state = "logged-out";
  mock.emit();
  assert.equal(menu().at(-1)[1].at(-1), "login");
  assert.ok(
    !menu()
      .flatMap(([, ids]) => ids)
      .includes("logout"),
  );
});

test("no two entries share a label, in English and in Chinese", (t) => {
  for (const language of ["en", "zh-CN"]) {
    const { labels, menu } = fixture(t, (mock) => {
      mock.state.preferences.resolvedLanguage = language;
    });
    const names = labels();
    assert.ok(names.length >= 16, language);
    assert.equal(new Set(names).size, names.length, names.join(" | "));
    if (language === "zh-CN")
      assert.deepEqual(
        menu().map(([name]) => name),
        ["账户与数据", "工具", "设置", "应用"],
      );
  }
});

test("actions the theme does not know yet join the closest group", (t) => {
  const { menu } = fixture(t, (mock) => {
    const listActions = mock.sdk.host.listActions;
    mock.sdk.host.listActions = () => [
      ...listActions(),
      extra("settings:future"),
      extra("tool:future"),
      extra("future-global"),
    ];
  });
  const groups = Object.fromEntries(menu());
  // About stays right under the theme settings, signing out stays last.
  assert.deepEqual(groups.Settings.slice(-3), [
    "settings:future",
    "appearance",
    "settings:about",
  ]);
  assert.deepEqual(groups.Tools, ["tools", "quick-otp", "tool:future"]);
  assert.deepEqual(groups.App, [
    "extension",
    "pwa-install",
    "future-global",
    "logout",
  ]);
});

test("single tools and sync services are listed only without their pages", (t) => {
  const { mock } = fixture(t);
  const actions = mock.sdk.host.listActions();
  const ids = (list) =>
    buildMenu(list, { session: "authenticated" }).flatMap(({ entries }) =>
      entries.map((entry) => entry.actionId),
    );
  assert.ok(!ids(actions).some((id) => /^(tool|sync-provider):/.test(id)));
  const without = actions.map((action) =>
    ["tools", "settings:sync"].includes(action.actionId)
      ? { ...action, enabled: false }
      : action,
  );
  assert.equal(ids(without).filter((id) => id.startsWith("tool:")).length, 6);
  assert.equal(
    ids(without).filter((id) => id.startsWith("sync-provider:")).length,
    4,
  );
});

test("account and queue actions, and the status-area actions, stay out of the menu", (t) => {
  const { mock } = fixture(t);
  const ids = buildMenu(mock.sdk.host.listActions(), {
    session: "authenticated",
    installAvailable: false,
  }).flatMap(({ entries }) => entries.map((entry) => entry.actionId));
  for (const id of [
    "account-edit",
    "account-delete",
    "account-qr",
    "offline-queue-edit",
    "recovery",
    "hidden-accounts",
    "offline-queue",
    "offline-queue-status-retry",
    "pwa-install",
    "login",
  ])
    assert.ok(!ids.includes(id), id);
});
