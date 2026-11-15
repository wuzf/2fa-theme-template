import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mount } from "../src/theme.js";
import { hostAppearance } from "../src/hostAppearance.js";
import { hostKeys, languages } from "../src/i18n.js";

// These tests run the real 2FA page script (SDK, OTP engine, HOTP commands,
// host dialogs) from a host checkout: HOST_ROOT=../2fa node --test <file>.
// Without HOST_ROOT they are skipped.
const hostRoot = process.env.HOST_ROOT;
const integration = hostRoot ? test : test.skip;
const records = [
  {
    id: "totp",
    name: "RFC account",
    account: "synthetic@example.invalid",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    type: "TOTP",
    digits: 8,
    period: 30,
    algorithm: "SHA1",
  },
  {
    id: "hotp",
    name: "RFC HOTP",
    account: "Synthetic counter",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    type: "HOTP",
    digits: 6,
    algorithm: "SHA1",
    counter: 0,
    hotpCounterNamespace: "template-test",
  },
];
async function fixture(t, { fetch: customFetch } = {}) {
  const { createRuntimeFixture } = await import(
    pathToFileURL(resolve(hostRoot, "tests/helpers/theme-runtime.js")).href
  );
  let server = structuredClone(records);
  const copies = [],
    requests = [];
  const h = await createRuntimeFixture({
    accountDOM: false,
    clipboard: { writeText: async (value) => copies.push(value) },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (customFetch) return customFetch(url, options);
      if (url === "/api/secrets/hotp/counter") {
        server = server.map((item) =>
          item.id === "hotp" ? { ...item, counter: item.counter + 1 } : item,
        );
        return Response.json({
          success: true,
          data: { secret: server.find((item) => item.id === "hotp") },
        });
      }
      if (url === "/api/secrets") return Response.json(server);
      return Response.json({});
    },
  });
  h.setClock(59000);
  const runtime = h.getThemeRuntime();
  h.replaceSecretRecords(server, { source: "server", accessVerified: true });
  await runtime.otp.refresh();
  const root = h.document.createElement("div");
  h.document.body.append(root);
  const app = mount({
    root,
    sdk: runtime.sdk,
    appearance: { settings: { density: "comfortable" } },
  });
  t.after(async () => {
    app.unmount();
    await h.dispose();
  });
  const click = (selector) => {
    const node = root.querySelector(selector);
    assert.ok(node, selector);
    node.click();
  };
  async function wait(predicate) {
    for (let n = 0; n < 100; n++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(predicate(), "Expected host state did not settle");
  }
  return { ...h, runtime, root, app, copies, requests, click, wait };
}

integration(
  "real SDK: shows RFC TOTP codes and copies the current and the next code",
  async (t) => {
    const h = await fixture(t);
    assert.ok(h.document.getElementById("secretsList") === null);
    assert.equal(
      h.root.querySelector('[data-account="totp"] .tpl-code-value').textContent,
      "94287082",
    );
    h.click('[data-account="totp"] [data-action="copy"]');
    assert.deepEqual(h.copies, ["94287082"]);
    const next = h.runtime.sdk
      .getSnapshot()
      .library.accounts.find((item) => item.ref.id === "totp").otp.next.value;
    h.click('[data-account="totp"] [data-action="next"]');
    assert.deepEqual(h.copies, ["94287082", next]);
  },
);

integration(
  "real SDK: the copy notice says whether the current or the next code was copied",
  async (t) => {
    const h = await fixture(t);
    const notice = h.root.querySelector(".tpl-notice");
    const name = h.runtime.sdk
      .getSnapshot()
      .library.accounts.find((item) => item.ref.id === "totp").service.label;
    const said = (key) => h.runtime.sdk.i18n.t(key, { name });
    h.click('[data-account="totp"] [data-action="copy"]');
    await h.wait(() => !notice.hidden);
    assert.equal(notice.textContent, said("coreCopiedService"));
    h.click('[data-account="totp"] [data-action="next"]');
    await h.wait(() => notice.textContent === said("coreCopiedNextService"));
    assert.notEqual(said("coreCopiedService"), said("coreCopiedNextService"));
  },
);

integration(
  "real SDK: a HOTP copy reserves the counter once and shows the new code and counter",
  async (t) => {
    const h = await fixture(t);
    h.click('[data-account="hotp"] [data-action="copy"]');
    assert.deepEqual(h.copies, ["755224"]);
    await h.wait(
      () =>
        h.getPrivateRecords().find((item) => item.id === "hotp").counter ===
          1 &&
        h.root.querySelector('[data-account="hotp"] .tpl-code-value')
          .textContent === "287082",
    );
    const reservations = h.requests.filter(
      (item) => item.url === "/api/secrets/hotp/counter",
    );
    assert.equal(reservations.length, 1);
    assert.match(
      h.root.querySelector('[data-account="hotp"] .tpl-time').textContent,
      / 1$/,
    );
  },
);

integration(
  "real SDK: the account menu copies URI and link and opens the host's edit dialog",
  async (t) => {
    const h = await fixture(t);
    h.click('[data-account="hotp"] [data-action="uri"]');
    assert.match(h.copies[0], /^otpauth:\/\/hotp\//);
    assert.match(h.copies[0], /counter=0/);
    h.click('[data-account="totp"] [data-action="link"]');
    assert.match(h.copies[1], /\/otp\//);
    assert.match(h.copies[1], /digits=8/);
    h.click('[data-account="totp"] [data-action="edit"]');
    await h.wait(
      () => h.document.getElementById("secretName")?.value === "RFC account",
    );
    assert.equal(
      h.document.getElementById("secretService").value,
      "synthetic@example.invalid",
    );
  },
);

integration(
  "real SDK: a HOTP copy with a local counter conflict stays recoverable until a check succeeds",
  async (t) => {
    let finishReservation;
    const reservation = new Promise((resolve) => {
      finishReservation = resolve;
    });
    let reconcileAvailable = false;
    let pendingRead;
    let finishRead;
    const changed = records.map((account) =>
      account.id === "hotp" ? { ...account, counter: 9 } : { ...account },
    );
    const h = await fixture(t, {
      fetch: async (url) => {
        if (url === "/api/secrets/hotp/counter") return reservation;
        if (url === "/api/secrets") {
          if (pendingRead) return pendingRead;
          return reconcileAvailable
            ? Response.json(changed)
            : Response.json(
                { error: "temporarily unavailable" },
                { status: 503 },
              );
        }
        return Response.json({});
      },
    });
    const operation = () => h.runtime.sdk.getSnapshot().host.operations[0];
    const countRequests = (url) =>
      h.requests.filter((request) => request.url === url).length;
    const panel = h.root.querySelector(".tpl-operations");
    h.click('[data-account="hotp"] [data-action="copy"]');
    assert.deepEqual(h.copies, ["755224"]);
    assert.equal(countRequests("/api/secrets/hotp/counter"), 1);
    h.replaceSecretRecords(changed, { source: "server", accessVerified: true });
    finishReservation(
      Response.json({
        success: true,
        data: { secret: { ...records[1], counter: 1 } },
      }),
    );
    await h.wait(() => operation()?.status === "settled");
    await Promise.resolve();
    assert.deepEqual(
      Object.fromEntries(
        [
          "status",
          "clipboard",
          "reservation",
          "localCommit",
          "reconciliation",
          "recovery",
        ].map((key) => [key, operation()[key]]),
      ),
      {
        status: "settled",
        clipboard: "copied",
        reservation: "confirmed",
        localCommit: "failed",
        reconciliation: "failed",
        recovery: "retry-reconcile",
      },
    );
    assert.equal(panel.hidden, false);
    assert.equal(panel.querySelectorAll('[data-action="reconcile"]').length, 1);
    const i18n = h.runtime.sdk.i18n;
    const failedText = i18n.t("coreHotpReconcileFailed");
    const clipboardText = i18n.t("coreHotpClipboardState", {
      state: i18n.t("coreHotpStateCopied"),
    });
    const reservationText = i18n.t("coreHotpReservationState", {
      state: i18n.t("coreHotpStateConfirmed"),
    });
    assert.ok(panel.textContent.includes(failedText));
    const notice = h.root.querySelector(".tpl-notice");
    assert.ok(notice.textContent.includes(clipboardText));
    assert.ok(notice.textContent.includes(reservationText));
    assert.ok(notice.textContent.includes(failedText));

    // The panel stays while the account is filtered out of view.
    h.runtime.sdk.view.setQuery("RFC account");
    assert.ok(
      h.root.querySelector('.tpl-groups [data-account="hotp"]') === null,
    );
    assert.equal(panel.hidden, false);
    pendingRead = new Promise((resolve) => {
      finishRead = resolve;
    });
    h.click('.tpl-operations [data-action="reconcile"]');
    await h.wait(() => countRequests("/api/secrets") === 2);
    assert.equal(operation().reconciliation, "running");
    assert.equal(
      panel.querySelector('[data-action="reconcile"]').disabled,
      true,
    );
    finishRead(Response.json({ error: "still unavailable" }, { status: 503 }));
    pendingRead = null;
    await h.wait(() => operation().reconciliation === "failed");
    assert.equal(panel.hidden, false);
    assert.equal(
      panel.querySelector('[data-action="reconcile"]').disabled,
      false,
    );

    reconcileAvailable = true;
    h.click('.tpl-operations [data-action="reconcile"]');
    await h.wait(() => operation().reconciliation === "succeeded");
    assert.equal(operation().recovery, "reconciled");
    assert.equal(panel.hidden, true);
    // Never a second reservation or a second copy.
    assert.equal(countRequests("/api/secrets/hotp/counter"), 1);
    assert.deepEqual(h.copies, ["755224"]);
  },
);

integration(
  "real SDK: an unknown HOTP reservation stays explicit after a successful check",
  async (t) => {
    const advanced = records.map((account) =>
      account.id === "hotp" ? { ...account, counter: 1 } : { ...account },
    );
    const h = await fixture(t, {
      fetch: async (url) =>
        url === "/api/secrets/hotp/counter"
          ? Response.json({ error: "reservation unconfirmed" }, { status: 503 })
          : Response.json(url === "/api/secrets" ? advanced : {}),
    });
    h.click('[data-account="hotp"] [data-action="copy"]');
    const operation = () => h.runtime.sdk.getSnapshot().host.operations[0];
    await h.wait(() => operation()?.status === "settled");
    assert.equal(operation().reservation, "unknown");
    const panel = h.root.querySelector(".tpl-operations");
    assert.equal(panel.hidden, false);
    h.click('.tpl-operations [data-action="reconcile"]');
    const unknown = h.runtime.sdk.i18n.t("coreHotpReservationState", {
      state: h.runtime.sdk.i18n.t("coreHotpStateUnknown"),
    });
    const reads = () =>
      h.requests.filter((request) => request.url === "/api/secrets").length;
    await h.wait(
      () => operation().reconciliation === "succeeded" && reads() === 2,
    );
    await Promise.resolve();
    assert.equal(panel.hidden, false);
    assert.ok(
      h.root.querySelector(".tpl-notice").textContent.includes(unknown),
    );
    const reservations = h.requests.filter(
      (request) => request.url === "/api/secrets/hotp/counter",
    );
    assert.equal(reservations.length, 1);
    assert.deepEqual(h.copies, ["755224"]);
  },
);

integration(
  "real SDK: hidden accounts, an unconfirmed session and signing out show their entries",
  async (t) => {
    const h = await fixture(t);
    const entry = (id) =>
      h.root.querySelector(`.tpl-menu-entry[data-value="${id}"]`);
    const $ = (selector) => h.root.querySelector(selector);
    const extension = $('.tpl-footer-links button[data-value="extension"]');
    assert.equal(h.runtime.sdk.getSnapshot().session.state, "authenticated");
    assert.ok(entry("login") === null);
    assert.ok(entry("logout"));
    assert.equal(extension.disabled, false);
    assert.ok(h.root.querySelector('[data-state="hidden"]') === null);
    h.runtime.accounts.setHidden({
      count: 1,
      records: [{ id: "hidden-fixture", reason: "unsupported" }],
    });
    await h.wait(() => h.root.querySelector('[data-state="hidden"]'));
    assert.equal(
      h.root.querySelector('[data-state="hidden"] button').dataset.value,
      "hidden-accounts",
    );
    assert.ok(entry("hidden-accounts") === null);
    h.runtime.accounts.setHidden({ count: 0, records: [] });
    await h.wait(() => !h.root.querySelector('[data-state="hidden"]'));
    // Unconfirmed: sign in from the status row, sign out stays in the menu.
    h.invalidateSecretSession({ blocked: false });
    await h.wait(
      () => h.runtime.sdk.getSnapshot().session.state === "unconfirmed",
    );
    assert.ok(entry("login") === null);
    assert.ok(entry("logout"));
    assert.equal(
      h.root.querySelector('[data-state="session"] button').dataset.value,
      "login",
    );
    h.invalidateSecretSession();
    await h.wait(
      () => h.runtime.sdk.getSnapshot().session.state === "logged-out",
    );
    assert.ok(entry("login"));
    assert.ok(entry("logout") === null);
    const empty = h.root.querySelector(".tpl-empty");
    assert.equal(empty.hidden, false);
    assert.equal(empty.querySelector("button").dataset.value, "login");
    // Nothing to search or sort; the host blocks its extension page, whose
    // footer entry stays (disabled) so the links keep their even columns.
    assert.equal($(".tpl-search").hidden, true);
    assert.equal($(".tpl-toolbar").hidden, true);
    assert.equal(extension.disabled, true);
    assert.equal(extension.hidden, false);
    assert.ok(extension.parentElement === $(".tpl-footer-links"));
  },
);

integration(
  "real SDK: every host label the theme uses exists in all 15 languages",
  async (t) => {
    const h = await fixture(t);
    for (const language of languages) {
      await h.runtime.sdk.preferences.set({ language });
      assert.equal(h.root.querySelector(".tpl-theme").lang, language);
      const missing = Object.keys(hostKeys).filter(
        (key) => h.runtime.sdk.i18n.t(key) === key,
      );
      assert.deepEqual(missing, [], language);
    }
  },
);

integration(
  "real SDK: in every language each menu entry is labelled, reachable and unique",
  async (t) => {
    const h = await fixture(t);
    const tools = /^tool:/;
    const providers = /^sync-provider:/;
    for (const language of languages) {
      await h.runtime.sdk.preferences.set({ language });
      const descriptors = h.runtime.sdk.host
        .listActions()
        .filter((item) => !item.requires);
      const enabled = new Set(
        descriptors.filter((item) => item.enabled).map((item) => item.actionId),
      );
      for (const descriptor of descriptors) {
        // Not menu entries: the status area opens these when they apply, and
        // the host's own error bar offers safe mode. This session is signed
        // in, with no hidden accounts, queue or install prompt.
        const contextual = [
          "login",
          "hidden-accounts",
          "offline-queue",
          "offline-queue-status-retry",
          "pwa-install",
          "recovery",
        ];
        const id = descriptor.actionId;
        const target =
          tools.test(id) && enabled.has("tools")
            ? "tools"
            : providers.test(id) && enabled.has("settings:sync")
              ? "settings:sync"
              : id;
        const node = h.root.querySelector(
          `.tpl-menu-entry[data-value="${target}"]`,
        );
        if (contextual.includes(id))
          assert.ok(node === null, `${language} ${id}`);
        else assert.ok(node, `${language}: ${id}`);
        assert.notEqual(
          h.runtime.sdk.i18n.t(descriptor.labelKey),
          descriptor.labelKey,
          `${language}: label of ${id}`,
        );
      }
      const labels = [
        ...h.root.querySelectorAll(
          ".tpl-menu .tpl-menu-entry > span, .tpl-menu [data-action='scheme']",
        ),
      ].map((node) => node.textContent.trim());
      assert.ok(labels.length >= 16, language);
      assert.deepEqual(
        labels.filter((label, index) => labels.indexOf(label) !== index),
        [],
        `${language}: duplicate menu labels`,
      );
      assert.ok(!labels.some((label) => /^[a-z]+[A-Z]\w+$/.test(label)));
    }
    h.runtime.sdk.view.setMode("flat");
    h.runtime.sdk.view.setSort({ flatSort: "name-desc" });
    assert.equal(h.root.querySelector('[data-setting="mode"]').value, "flat");
    assert.equal(
      h.root.querySelector('[data-setting="sort"]').value,
      "name-desc",
    );
  },
);

integration(
  "the host accepts the theme's dialog colours for light and dark",
  async () => {
    const { normalizeHostAppearance } = await import(
      pathToFileURL(resolve(hostRoot, "src/ui/runtime/hostAppearance.js")).href
    );
    for (const dark of [false, true]) {
      const tokens = hostAppearance({}, dark);
      assert.deepEqual(normalizeHostAppearance(tokens), tokens);
    }
  },
);
