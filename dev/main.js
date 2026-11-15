import { mount } from "../src/theme.js";
import { createSyntheticSdk } from "./synthetic-sdk.js";

const query = new URLSearchParams(location.search);
const shell = createSyntheticSdk({
  onCall(method, value) {
    document.querySelector("#dev-output").textContent =
      method +
      "\n" +
      JSON.stringify(
        value,
        (key, item) => (key === "options" ? undefined : item),
        2,
      );
  },
});
// The real host advances sdk.clock and rotates codes every period; the
// synthetic fixture is frozen one second before its codes expire, so the
// shell follows wall time and derives fresh synthetic codes each window.
shell.sdk.clock.now = () => Date.now();
let lastWindow = -1;
function advanceDemo() {
  const period = Math.floor(Date.now() / 30000);
  if (period === lastWindow) return;
  lastWindow = period;
  shell.state.clock.correctedNow = Date.now();
  for (const [index, account] of shell.state.library.accounts.entries()) {
    if (account.type === "HOTP") continue;
    for (const [slot, offset] of [
      ["current", 0],
      ["next", 1],
    ]) {
      const code = account.otp[slot];
      if (!code) continue;
      code.value = String(
        (period + offset + (index + 1) * 148329) % 10 ** account.digits,
      ).padStart(account.digits, "0");
      code.validFrom = (period + offset) * 30000;
      code.validUntil = (period + offset + 1) * 30000;
    }
    account.otp.displayRevision += 1;
  }
  shell.emit();
}
// ?state=… shows one of the states a theme must handle (see dev/index.html).
const state = shell.state;
const variants = {
  loading() {
    state.library.state = "loading";
    state.library.accounts = [];
  },
  empty() {
    state.library.accounts = [];
  },
  error() {
    state.library.state = "error";
    state.library.errorKey = "coreConnectionFailed";
    state.library.accounts = [];
  },
  "logged-out"() {
    state.session = { state: "logged-out", accessVerified: false };
    state.library.accounts = [];
    // Like the host: signed out, only these stay available until a new login.
    const open = ["login", "recovery", "quick-otp", "pwa-install"];
    for (const action of shell.sdk.host.listActions())
      if (!open.includes(action.request.kind))
        Object.assign(action, {
          enabled: false,
          reason: "authentication-required",
        });
  },
  unconfirmed() {
    state.session = { state: "unconfirmed", accessVerified: false };
    state.library.source = "local";
  },
  offline() {
    state.connectivity.onlineHint = false;
    state.queue.operations = [
      { operationId: "q1", type: "update", name: "GitHub", status: "pending" },
    ];
    for (const account of state.library.accounts)
      if (account.type === "HOTP")
        account.otp.current.copyAvailability = "offline";
  },
  hidden() {
    state.library.hidden = { count: 2, detailsAvailable: false, records: [] };
  },
  hotp() {
    const operation = {
      operationId: "op1",
      type: "hotp",
      accountId: "hotp",
      status: "settled",
      clipboard: "copied",
      reservation: "unknown",
      localCommit: "not-attempted",
      reconciliation: "failed",
      recovery: "retry-reconcile",
    };
    state.host.operations = [operation];
    state.library.accounts.find(
      (account) => account.type === "HOTP",
    ).otp.operation = operation;
  },
};
variants[query.get("state")]?.();
shell.sdk.preferences.set({
  theme: query.get("scheme") || "light",
  language: query.get("lang") || "en",
});
// The host marks dark mode on <html>; the shell does the same.
shell.sdk.subscribe((snapshot) => {
  document.documentElement.dataset.theme = snapshot.preferences.resolvedTheme;
  document.documentElement.lang = snapshot.preferences.resolvedLanguage;
});
advanceDemo();
const app = mount({
  root: document.querySelector("#app"),
  sdk: shell.sdk,
  appearance: {
    package: { id: "my-2fa-theme", name: "My Theme", version: "0.1.0" },
    settings: { density: query.get("density") || "comfortable" },
  },
});
const timer = window.setInterval(advanceDemo, 1000);
window.addEventListener(
  "pagehide",
  () => {
    window.clearInterval(timer);
    app.unmount();
  },
  { once: true },
);
