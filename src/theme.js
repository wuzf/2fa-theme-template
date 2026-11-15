import { buildMenu, labelOverrides } from "./menu.js";
import { themeText, hostText } from "./i18n.js";
import { hostAppearance } from "./hostAppearance.js";

/* My Theme: a plain, complete 2FA frontend to build your own on.

   - mount() builds the page once. Every host snapshot (sdk.subscribe) runs
     render(), which updates text, attributes and order in place, so focus and
     an open menu survive the updates that arrive every few seconds.
   - The host stays the only authority. Codes come from the snapshot, copying
     goes through sdk.otp.readCopyTarget() + sdk.otp.copy(), and every change
     (add, edit, delete, import, settings, signing in or out) opens a host
     dialog through sdk.host.open(). Never compute codes or call the 2FA API.
   - Class names start with "tpl-" and src/styles/ uses them; rename the
     prefix everywhere at once if you like.
   Places meant for customising are marked "Customise:". */

// Customise: the account menu, as [action, host label key]. onClick says
// what each action does; keep "delete" last.
const accountMenu = [
  ["qr", "cardMenuQRCode"],
  ["uri", "cardMenuCopyURI"],
  ["link", "cardMenuCopyLink"],
  ["edit", "cardMenuEdit"],
  ["delete", "cardMenuDelete"],
];
// View choices as [value, host label key]. Grouped lists sort inside each
// group, so they cannot sort by service name.
const modes = [
  ["grouped", "viewModeGrouped"],
  ["flat", "viewModeFlat"],
];
const sorts = [
  ["oldest-first", "sortOldestFirst"],
  ["newest-first", "sortNewestFirst"],
  ["name-asc", "sortServiceNameAsc"],
  ["name-desc", "sortServiceNameDesc"],
  ["account-asc", "sortAccountNameAsc"],
  ["account-desc", "sortAccountNameDesc"],
];
const groupSorts = [
  ["name-asc", "groupSortNameAsc"],
  ["name-desc", "groupSortNameDesc"],
];
// Buttons of the status rows and the empty block, as [action, value, host
// label key]; onClick says what each action does.
const actions = {
  login: ["host", "login", "loginSubmitBtn"],
  retry: ["refresh", "", "retry"],
  add: ["host", "account-add", "emptyAddBtn"],
  clear: ["clear", "", "searchClearAriaLabel"],
  hidden: ["host", "hidden-accounts", "pageHiddenAccounts"],
  queue: ["host", "offline-queue", "offlineQueueView"],
  queueRetry: ["host", "offline-queue-status-retry", "restoreRefresh"],
  update: ["reload", "update", "update"],
};
// Host rejection reasons and the host messages that explain them.
const reasons = {
  "authentication-required": "loginSubmitBtn",
  "write-busy-reclick": "coreHotpWriteBusy",
  offline: "coreHotpCopyOffline",
  "clipboard-failed": "copyFailed",
  "reservation-rejected": "coreHotpRejected",
  "operation-pending-account-changed": "coreHotpAccountChangedPending",
  "counter-limit": "coreHotpLimit",
  "reconciliation-failed": "coreHotpReconcileFailed",
  // The code changed between the click and the copy: copy again.
  "not-ready": "coreCodeUpdating",
  "stale-target": "coreCodeUpdating",
  expired: "coreCodeUpdating",
  "clock-changed": "coreCodeUpdating",
};
const hotpStates = {
  pending: "coreHotpStatePending",
  confirmed: "coreHotpStateConfirmed",
  rejected: "coreHotpStateRejected",
  copied: "coreHotpStateCopied",
  failed: "coreHotpStateFailed",
};

/** A HOTP copy reports separate facts: clipboard, server reservation, local
    commit and reconciliation. Only these combinations are fully done; the
    rest stay on screen until the user checks them (sdk.otp.reconcile). */
function resolved(operation) {
  if (
    operation.status !== "settled" ||
    operation.clipboard !== "copied" ||
    operation.reservation !== "confirmed" ||
    (operation.reason === "local-refresh-failed" &&
      operation.reconciliation !== "succeeded")
  )
    return false;
  return (
    (operation.localCommit === "committed" &&
      operation.recovery === "none" &&
      ["not-needed", "succeeded"].includes(operation.reconciliation)) ||
    (operation.reconciliation === "succeeded" &&
      operation.recovery === "reconciled")
  );
}

let sequence = 0; // unique element ids across mounts

export function mount({ root, sdk, appearance = {}, signal }) {
  if (!root || !sdk || signal?.aborted) return { update() {}, unmount() {} };
  // The theme runs inside the host page: use its document, never globals.
  const document = root.ownerDocument;
  const window = document.defaultView;
  // Customise: the theme's routes, #/theme/<theme id>/accounts and …/manage.
  const route = "#/theme/my-2fa-theme/";
  const events = new window.AbortController(); // unmount removes all listeners
  const listen = (target, type, handler) =>
    target.addEventListener(type, handler, { signal: events.signal });
  let live = true;
  let snapshot = sdk.getSnapshot();
  let settings = {};
  let lang = "en";
  let openMenu = null; // the card whose account menu is open
  let lastMenu = "";
  let lastAppearance = "";
  let noticeTimer = null;
  let noticeGeneration = 0;
  const cards = new Map(); // account id → card
  const sections = new Map(); // group id → list section
  const stateRows = new Map(); // status key → row
  const operationRows = new Map(); // HOTP operation id → row
  const menuGroups = new Map(); // menu group → section
  const menuEntries = new Map(); // action id → menu entry
  const text = (key, params) => themeText(lang, key, params);
  const t = (key, params) => hostText(sdk, key, params);

  // h("p.tpl-notice", { role: "status" }, …children) builds an element.
  function h(tag, attributes = {}, ...children) {
    const [name, ...classes] = tag.split(".");
    const node = document.createElement(name);
    if (classes.length) node.className = classes.join(" ");
    for (const [key, value] of Object.entries(attributes))
      if (/^(data-|aria-|role$)/.test(key)) node.setAttribute(key, value);
      else node[key] = value;
    node.append(...children);
    return node;
  }
  const button = (classes, action, value = "", ...children) =>
    h(
      "button." + classes,
      { type: "button", "data-action": action, "data-value": value },
      ...children,
    );
  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  // Puts `nodes` into `parent` in this order, moving rather than recreating.
  function syncChildren(parent, nodes) {
    nodes.forEach((node, index) => {
      if (parent.children[index] !== node)
        parent.insertBefore(node, parent.children[index] || null);
    });
    while (parent.children.length > nodes.length)
      parent.lastElementChild.remove();
  }
  // Before a focused control disappears, move focus somewhere stable.
  function keepFocus(node) {
    if (!snapshot.host.dialogOpen && node.contains(document.activeElement))
      manage.focus({ preventScroll: true });
  }
  // Shows one of `actions` on a button, or hides the button.
  function setAction(node, [action = "", value = "", labelKey] = []) {
    if (!action) keepFocus(node);
    node.hidden = !action;
    Object.assign(node.dataset, { action, value });
    setText(node, labelKey ? t(labelKey) : "");
  }
  const translate = (choices) => choices.map(([id, key]) => [id, t(key)]);
  function field(setting) {
    const title = h("span.tpl-field-label");
    const input = h("select.tpl-select", { "data-setting": setting });
    return { title, input, label: h("label.tpl-field", {}, title, input) };
  }
  function fillField(control, title, choices, value) {
    setText(control.title, title);
    const signature = JSON.stringify(choices);
    if (control.input.dataset.choices !== signature) {
      control.input.replaceChildren(
        ...choices.map(([id, label]) =>
          h("option", { value: id, textContent: label }),
        ),
      );
      control.input.dataset.choices = signature;
    }
    if (control.input.value !== value) control.input.value = value;
  }

  // ---- Page skeleton. Customise: reorder or restyle freely. ----
  const search = h("input.tpl-search-input", {
    type: "search",
    autocomplete: "off",
    spellcheck: false,
    // Password managers should not offer to fill the account search.
    "data-lpignore": "true",
    "data-1p-ignore": "true",
    "data-bwignore": "true",
  });
  const clear = button("tpl-icon-button", "clear", "", "×");
  const searchForm = h("form.tpl-search", { role: "search" }, search, clear);
  const manage = button("tpl-button", "route");
  const header = h(
    "header.tpl-header",
    {},
    h("h1.tpl-brand", { textContent: "2FA" }), // the host names the site 2FA
    searchForm,
    manage,
  );
  // Short results such as "copied", announced by screen readers.
  const notice = h("p.tpl-notice", { role: "status", hidden: true });
  const states = h("section.tpl-states");
  const operationsTitle = h("h2.tpl-panel-title");
  const operations = h("section.tpl-panel.tpl-operations");
  const service = field("service");
  const mode = field("mode");
  const sort = field("sort");
  const groupSort = field("groupSort");
  const toolbar = h(
    "div.tpl-toolbar",
    {},
    service.label,
    mode.label,
    sort.label,
    groupSort.label,
  );
  const accountsTitle = h("h2.tpl-sr-only", { tabIndex: -1 });
  const found = h("p.tpl-found");
  const emptyTitle = h("h3.tpl-empty-title");
  const emptyText = h("p");
  const emptyAction = button("tpl-button.is-primary", "refresh");
  const empty = h("div.tpl-empty", {}, emptyTitle, emptyText, emptyAction);
  const groupList = h("div.tpl-groups");
  const accountsPage = h(
    "section.tpl-page",
    {},
    accountsTitle,
    toolbar,
    found,
    empty,
    groupList,
  );
  const manageTitle = h("h2.tpl-page-title", { tabIndex: -1 });
  const menu = h("div.tpl-menu");
  const scheme = button("tpl-menu-entry", "scheme"); // the light/dark switch
  const managePage = h("section.tpl-page", { hidden: true }, manageTitle, menu);
  // Footer: the 2FA version and project links from snapshot.host.about, and
  // the host's browser extension page. Keep an even number of links: on a
  // phone they form two columns under the version.
  const version = h("span.tpl-version");
  const external = { target: "_blank", rel: "noopener noreferrer" };
  const update = h("a.tpl-link.tpl-update", external);
  const links = [
    ["documentation", "pageDocumentation"],
    ["extension", "pageBrowserExtension"], // a host dialog, not a web page
    ["feedback", "pageFeedback"],
    ["source", "aboutSourceCode"],
  ].map(([key, labelKey]) => ({
    key,
    labelKey,
    node:
      key === "extension"
        ? button("tpl-link", "host", key)
        : h("a.tpl-link", external),
  }));
  const footer = h(
    "footer.tpl-footer",
    {},
    h("div.tpl-footer-head", {}, version, update),
    h("div.tpl-footer-links", {}, ...links.map((link) => link.node)),
  );
  const main = h(
    "main.tpl-main",
    {},
    notice,
    states,
    operations,
    accountsPage,
    managePage,
  );
  const surface = h("div.tpl-theme", {}, header, main, footer);
  root.append(surface);

  const account = (id) =>
    snapshot.library.accounts.find((item) => item.ref.id === id);

  // ---- Messages and command results ----
  function say(message, kind = "info") {
    window.clearTimeout(noticeTimer);
    setText(notice, message);
    notice.dataset.kind = kind;
    notice.hidden = !message;
    if (message)
      noticeTimer = window.setTimeout(
        () => (notice.hidden = true),
        kind === "error" ? 8000 : 4000,
      );
  }
  function explain(reason) {
    if (reasons[reason]) return t(reasons[reason]);
    return text(/unavailable/.test(reason) ? "unavailable" : "failed");
  }
  function facts(operation) {
    const state = (value) => t(hotpStates[value] || "coreHotpStateUnknown");
    let attention = t("coreHotpReconcile");
    if (operation.reconciliation === "running") attention = text("waiting");
    else if (
      operation.reconciliation === "failed" ||
      operation.recovery === "retry-reconcile"
    )
      attention = t("coreHotpReconcileFailed");
    else if (
      operation.clipboard === "failed" &&
      operation.reservation === "confirmed"
    )
      attention = t("coreHotpCopyFailedAdvanced");
    else if (resolved(operation)) attention = "";
    return [
      t("coreHotpClipboardState", { state: state(operation.clipboard) }),
      t("coreHotpReservationState", { state: state(operation.reservation) }),
      attention,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  // Shows the outcome of an SDK promise unless the page or session moved on.
  // `operationId` names the HOTP copy that a reconciliation checked.
  function observe(promise, success = "", operationId = null) {
    const session = snapshot.epochs.session;
    const generation = ++noticeGeneration;
    Promise.resolve(promise).then(
      (result) => {
        if (
          !live ||
          generation !== noticeGeneration ||
          snapshot.epochs.session !== session ||
          /invalidated/.test(result?.reason)
        )
          return;
        const checked = snapshot.host.operations?.find(
          (operation) => operation.operationId === operationId,
        );
        const kind = (done) => (done ? "info" : "error");
        // A successful check only read the server: say what it found.
        if (checked && result?.status === "committed")
          say(facts(checked), kind(resolved(checked)));
        else if (result?.reservation && result.reservation !== "not-attempted")
          say(facts(result), kind(resolved(result)));
        else if (result?.clipboard === "copied") say(success);
        else if (result?.clipboard) say(explain(result.reason), "error");
        else if (["rejected", "unknown"].includes(result?.status))
          say(explain(result.reason), "error");
        else if (success && ["committed", "loaded"].includes(result?.status))
          say(success);
      },
      () => live && say(text("failed"), "error"),
    );
  }
  // Opens a host dialog. Focus goes back to the trigger afterwards, to the
  // account's ⋯ button for account actions, or to Manage when the trigger is
  // a status button that may be gone by then.
  function host(request, trigger) {
    closeMenu(false);
    const stable = [header, managePage, footer].some((part) =>
      part.contains(trigger),
    );
    const card = cards.get(trigger.closest("[data-account]")?.dataset.account);
    const returnFocus = card?.trigger || (stable ? trigger : manage);
    const flow = sdk.host.open(request, { returnFocus });
    if (flow.status === "rejected") return say(explain(flow.reason), "error");
    observe(flow.closed);
    flow.closed.then(() => {
      // The host restores focus when it can; if that control is gone, land
      // on the page heading rather than on the document body.
      const active = document.activeElement;
      if (
        live &&
        !snapshot.host.dialogOpen &&
        (!active || active === document.body)
      )
        (managePage.hidden ? accountsTitle : manageTitle).focus();
    });
  }
  function copy(id, slot) {
    // readCopyTarget() and copy() run in the same click with nothing awaited
    // in between, and the ticket goes back exactly as it came.
    const read = sdk.otp.readCopyTarget(id, slot);
    if (read.status !== "ready") return say(explain(read.reason), "error");
    const card = cards.get(id);
    if (card) {
      // Show the code being copied, in case it changed a moment ago.
      card.code.classList.remove("is-new");
      setText(slot === "next" ? card.nextValue : card.code, read.target.value);
    }
    const name = account(id)?.service.label || "";
    const key = slot === "next" ? "coreCopiedNextService" : "coreCopiedService";
    observe(sdk.otp.copy(read.target), t(key, { name }));
  }

  // ---- Account cards ----
  function createCard(id) {
    const card = {
      icon: h("span.tpl-avatar", { "aria-hidden": "true" }),
      service: h("h3.tpl-service"),
      label: h("p.tpl-account"),
      trigger: button("tpl-icon-button.tpl-menu-trigger", "menu", "", "⋯"),
      actions: h("div.tpl-account-menu", { id: "tpl-menu-" + ++sequence }),
      items: accountMenu.map(([action]) =>
        button(
          "tpl-menu-item" + (action === "delete" ? ".is-danger" : ""),
          action,
        ),
      ),
      code: h("span.tpl-code-value"),
      nextLabel: h("span.tpl-next-label"),
      nextValue: h("span.tpl-next-value"),
      time: h("span.tpl-time"),
      fill: h("span.tpl-progress-fill"),
      status: h("p.tpl-code-status"),
      account: null,
      previous: "",
    };
    card.actions.hidden = true;
    card.actions.append(...card.items);
    card.trigger.setAttribute("aria-expanded", "false");
    card.trigger.setAttribute("aria-controls", card.actions.id);
    card.copyButton = button("tpl-code", "copy", "", card.code);
    card.next = button("tpl-next", "next", "", card.nextLabel, card.nextValue);
    card.progress = h("div.tpl-progress", { "aria-hidden": "true" }, card.fill);
    card.node = h(
      "article.tpl-card",
      { "data-account": id },
      h(
        "div.tpl-card-head",
        {},
        card.icon,
        h("div.tpl-names", {}, card.service, card.label),
        card.trigger,
        card.actions,
      ),
      card.copyButton,
      h("div.tpl-card-meta", {}, card.next, card.time),
      card.progress,
      card.status,
    );
    return card;
  }
  function updateCard(card, item) {
    const name = item.service.label;
    card.account = item;
    card.node.dataset.type = item.type;
    setText(card.service, name);
    setText(card.label, item.accountLabel);
    card.service.title = name;
    card.label.title = item.accountLabel;
    card.label.hidden = !item.accountLabel;
    setAvatar(card.icon, item.service);
    card.trigger.setAttribute(
      "aria-label",
      `${t("cardMenuTriggerTitle")} · ${name}`,
    );
    card.items.forEach((entry, index) =>
      setText(entry, t(accountMenu[index][1])),
    );
    const value = item.otp.current?.value || "······";
    if (card.previous && card.previous !== value) {
      // Customise: how a new code appears (see .is-new in the CSS).
      card.code.classList.remove("is-new");
      void card.code.offsetWidth; // restarts the CSS animation
      card.code.classList.add("is-new");
    }
    card.previous = value;
    setText(card.code, value);
    const availability = item.otp.current?.copyAvailability;
    card.copyButton.disabled = availability !== "ready";
    card.copyButton.setAttribute(
      "aria-label",
      `${t("copyOtpBtnAriaLabel")} · ${name} ${item.accountLabel}`,
    );
    card.next.hidden = card.progress.hidden = item.type === "HOTP";
    card.next.disabled = item.otp.next?.copyAvailability !== "ready";
    card.next.setAttribute(
      "aria-label",
      `${t("copyNextOtpBtnTitle")} · ${name}`,
    );
    setText(card.nextLabel, text("next"));
    setText(card.nextValue, item.otp.next?.value || "······");
    // Why the code cannot be copied right now, or where a HOTP copy stands.
    const operation = item.otp.operation;
    const status =
      operation && !resolved(operation)
        ? facts(operation)
        : availability === "offline"
          ? t("coreHotpCopyOffline")
          : availability === "ready"
            ? ""
            : text("waiting");
    setText(card.status, status);
    card.status.hidden = !status;
  }
  // The service icon once it has loaded, else the first letter.
  function setAvatar(node, { label, iconURL = "" }) {
    const letter = Array.from(label.trim())[0]?.toUpperCase() || "•";
    if (node.dataset.letter === letter && node.dataset.icon === iconURL) return;
    Object.assign(node.dataset, { letter, icon: iconURL });
    node.textContent = letter;
    if (!iconURL) return;
    // Anonymous, so the icon also loads inside the theme editor's preview.
    const image = h("img", { alt: "", crossOrigin: "anonymous" });
    image.onload = () =>
      node.dataset.icon === iconURL && node.replaceChildren(image);
    image.src = iconURL;
  }
  // Countdown and progress from the host clock, four times a second.
  function renderTime() {
    const now = sdk.clock.now();
    for (const card of cards.values()) {
      const item = card.account;
      if (item.type === "HOTP") {
        setText(card.time, `${t("transferCounter")} ${item.counter}`);
        continue;
      }
      const until = item.otp.current?.validUntil;
      const seconds =
        typeof now === "number" && until
          ? Math.max(0, Math.ceil((until - now) / 1000))
          : null;
      setText(
        card.time,
        seconds === null ? text("waiting") : text("secondsLeft", { seconds }),
      );
      card.node.dataset.expiring = String(seconds !== null && seconds <= 5);
      const share = seconds === null ? 0 : Math.min(1, seconds / item.period);
      card.fill.style.transform = `scaleX(${share})`;
      // The host replaces the code right after it expires.
      if (seconds === 0) card.copyButton.disabled = true;
    }
  }
  function renderAccounts() {
    const { accounts, view } = snapshot.library;
    const ids = new Set(accounts.map((item) => item.ref.id));
    for (const [id, card] of cards)
      if (!ids.has(id)) {
        if (openMenu === card) closeMenu(false);
        keepFocus(card.node);
        cards.delete(id);
      }
    for (const item of accounts) {
      let card = cards.get(item.ref.id);
      if (!card) cards.set(item.ref.id, (card = createCard(item.ref.id)));
      // A changed account (new generation) closes its stale menu.
      if (
        openMenu === card &&
        card.account.ref.generation !== item.ref.generation
      )
        closeMenu(false);
      updateCard(card, item);
    }
    // Only the accounts in view.resultIds show, in the host's order: grouped
    // by service, or as one flat list.
    const groups =
      view.mode === "grouped" && view.groups.length
        ? view.groups
        : [{ groupId: "", label: "", ids: view.resultIds }];
    const nodes = groups.map(({ groupId, label, ids }) => {
      let section = sections.get(groupId);
      if (!section) {
        const title = h("h3.tpl-group-title");
        const list = h("div.tpl-list");
        section = {
          title,
          list,
          node: h("section.tpl-group", {}, title, list),
        };
        sections.set(groupId, section);
      }
      setText(section.title, label);
      section.title.hidden = !label;
      syncChildren(
        section.list,
        ids.map((id) => cards.get(id)?.node).filter(Boolean),
      );
      return section.node;
    });
    syncChildren(groupList, nodes);
    for (const id of sections.keys())
      if (!groups.some((group) => group.groupId === id)) sections.delete(id);
    // Signed out, loading, failed, nothing yet or nothing found share one
    // block instead of the list: [title, description, button].
    const { library, session } = snapshot;
    const filtered = Boolean(view.query || view.serviceFilter);
    const failure = t(library.errorKey || "coreConnectionFailed");
    let block = null;
    if (session.state === "logged-out")
      block = [text("signedOut"), "", actions.login];
    else if (library.state === "loading") block = [t("loadingSecrets"), ""];
    else if (library.state === "error")
      block = [t("coreReadTitle"), failure, actions.retry];
    else if (!view.found && filtered)
      block = [t("searchNoMatch"), t("searchNoMatchDesc"), actions.clear];
    else if (!view.found)
      block = [t("emptyTitle"), t("emptyDesc"), actions.add];
    empty.hidden = !block;
    groupList.hidden = found.hidden = Boolean(block);
    found.hidden ||= !filtered;
    const counts = { found: view.found, total: view.total };
    setText(found, t("searchFoundCount", counts));
    setText(emptyTitle, block?.[0] || "");
    setText(emptyText, block?.[1] || "");
    emptyText.hidden = !block?.[1];
    setAction(emptyAction, block?.[2]);
    renderTime();
  }

  // ---- Status rows: preview, session, connection, hidden accounts… ----
  function renderStates() {
    const { library, queue, session, clock } = snapshot;
    const changes = queue.operations?.length || 0;
    const hidden = library.hidden.count;
    const failure = t(library.errorKey || "coreConnectionFailed");
    const rows = []; // [key, message, button from `actions`]
    const add = (...row) => rows.push(row);
    if (sdk.identity?.mode === "preview") add("preview", text("preview"));
    // An unconfirmed session may still show the accounts saved here.
    if (session.state === "unconfirmed")
      add("session", text("unconfirmed"), actions.login);
    // The host shows its own offline banner with the details; one word here.
    if (!snapshot.connectivity.onlineHint) add("offline", text("offline"));
    if (library.source === "local" && library.refreshState === "idle")
      add("local", text("localCopy"));
    if (library.refreshState === "error" && library.state !== "error")
      add("refresh-error", failure, actions.retry);
    if (clock.status === "local") add("clock", t("clockWarningText"));
    if (hidden) {
      const message = t("coreInvalidRecordsHidden", { count: hidden });
      add("hidden", message, actions.hidden);
    }
    // Changes made offline wait to be sent; the host's dialog lists each.
    if (changes) {
      const count = t("offlineQueueCount", { count: changes });
      const message = queue.authRequired
        ? t("offlineQueueAwaitingLogin")
        : count;
      add("queue", message, actions.queue);
    }
    if (queue.unavailable)
      add("queue-error", t("offlineQueueUnavailable"), actions.queueRetry);
    if (snapshot.host.updateAvailable || snapshot.host.versionMismatch)
      add("update", text("updateReady"), actions.update);
    for (const [key, row] of stateRows)
      if (!rows.some(([shown]) => shown === key)) {
        keepFocus(row.node);
        stateRows.delete(key);
      }
    const nodes = rows.map(([key, message, action]) => {
      let row = stateRows.get(key);
      if (!row) {
        const words = h("span");
        const control = button("tpl-button", "");
        const node = h("div.tpl-state", { "data-state": key }, words, control);
        stateRows.set(key, (row = { words, control, node }));
      }
      setText(row.words, message);
      setAction(row.control, action);
      return row.node;
    });
    syncChildren(states, nodes);
    states.hidden = rows.length === 0;
  }
  // Unfinished HOTP copies, also for accounts filtered out of view. Only the
  // user starts a check (reconcile); never retry or copy again by yourself.
  function renderOperations() {
    const records = (snapshot.host.operations || []).filter(
      (operation) => operation.type === "hotp" && !resolved(operation),
    );
    if (!records.length) keepFocus(operations);
    operations.hidden = records.length === 0;
    setText(operationsTitle, t("coreHotpOperationTitle"));
    const nodes = records.map((operation) => {
      const id = operation.operationId;
      let row = operationRows.get(id);
      if (!row) {
        const name = h("strong");
        const words = h("span");
        const check = button("tpl-button", "reconcile", id);
        const recover = button("tpl-button", "reload", "recovery");
        row = { name, words, check, recover };
        row.node = h("div.tpl-row", {}, name, words, check, recover);
        operationRows.set(id, row);
      }
      const name = account(String(operation.accountId))?.service.label;
      setText(row.name, name || "HOTP");
      setText(row.words, facts(operation));
      setText(row.check, t("coreHotpReconcile"));
      row.check.disabled = operation.reconciliation === "running";
      setText(row.recover, t("coreHotpRecoveryReload"));
      row.recover.hidden = operation.recovery !== "reload-required";
      return row.node;
    });
    for (const id of operationRows.keys())
      if (!records.some((operation) => operation.operationId === id))
        operationRows.delete(id);
    syncChildren(operations, [operationsTitle, ...nodes]);
  }

  // ---- Management page, drawn from src/menu.js ----
  function renderMenu() {
    const groups = buildMenu(sdk.host.listActions(), {
      session: snapshot.session.state,
      installAvailable: snapshot.host.installAvailable,
    });
    const dark = snapshot.preferences.resolvedTheme === "dark";
    const signature = JSON.stringify([lang, dark, groups]);
    if (signature === lastMenu) return;
    lastMenu = signature;
    setText(scheme, t(dark ? "themeLight" : "themeDark"));
    const nodes = groups
      .filter(({ entries }) => entries.length)
      .map(({ group, entries }) => {
        let section = menuGroups.get(group);
        if (!section) {
          const title = h("h3.tpl-menu-title");
          const list = h("div.tpl-menu-list");
          section = {
            title,
            list,
            node: h("section.tpl-menu-group", {}, title, list),
          };
          menuGroups.set(group, section);
        }
        setText(
          section.title,
          text("group" + group[0].toUpperCase() + group.slice(1)),
        );
        syncChildren(section.list, entries.map(menuEntry));
        return section.node;
      });
    const shown = new Set(
      groups.flatMap(({ entries }) => entries.map((entry) => entry.actionId)),
    );
    for (const [id, entry] of menuEntries)
      if (!shown.has(id)) {
        keepFocus(entry.node);
        menuEntries.delete(id);
      }
    syncChildren(menu, nodes);
  }
  function menuEntry(action) {
    if (action.actionId === "scheme") return scheme;
    let entry = menuEntries.get(action.actionId);
    if (!entry) {
      const label = h("span");
      const reason = h("small.tpl-reason");
      const node = button(
        "tpl-menu-entry",
        "host",
        action.actionId,
        label,
        reason,
      );
      menuEntries.set(action.actionId, (entry = { node, label, reason }));
    }
    setText(entry.label, t(labelOverrides[action.actionId] || action.labelKey));
    // An unavailable entry stays visible and says why.
    entry.node.disabled = !action.enabled;
    setText(entry.reason, action.enabled ? "" : explain(action.reason));
    entry.reason.hidden = action.enabled;
    return entry.node;
  }
  // The footer; hosts without snapshot.host.about have none.
  function renderAbout() {
    const about = snapshot.host.about;
    footer.hidden = !about;
    if (!about) return;
    setText(version, `2FA v${about.version}`);
    // A link to a newer release, when the host knows of one.
    update.hidden = !(about.latestVersion && about.links.releases);
    if (!update.hidden) {
      update.href = about.links.releases;
      const newer = { version: `v${about.latestVersion}` };
      setText(update, t("versionUpdateAvailable", newer));
    }
    const extension = sdk.host
      .listActions()
      .find((action) => action.actionId === "extension");
    for (const { key, labelKey, node } of links) {
      setText(node, t(labelKey));
      if (key === "extension") {
        // While the host blocks it (signed out) it stays, disabled, so the
        // links keep their even columns.
        node.hidden = !extension;
        node.disabled = !extension?.enabled;
        node.title =
          node.disabled && extension ? explain(extension.reason) : "";
      } else {
        node.hidden = !about.links[key];
        if (about.links[key]) node.href = about.links[key];
      }
    }
  }
  // Search, service filter, grouping and sort; all of it goes to sdk.view.
  function renderToolbar() {
    const { view } = snapshot.library;
    const flat = view.mode === "flat";
    search.placeholder = t("searchInputPlaceholder");
    search.setAttribute("aria-label", t("searchInputAriaLabel"));
    clear.setAttribute("aria-label", t("searchClearAriaLabel"));
    if (document.activeElement !== search) search.value = view.query; // typing
    if (!view.query && document.activeElement === clear) search.focus();
    clear.hidden = !view.query;
    // Signed out there is nothing to search, filter or sort.
    toolbar.hidden = snapshot.session.state === "logged-out";
    syncSearch();
    service.label.hidden = view.services.length < 2 && !view.serviceFilter;
    const services = view.services.map((item) => [
      item.groupId,
      `${item.label} (${item.count})`,
    ]);
    services.unshift(["", t("appearanceAllServices")]);
    const serviceTitle = t("appearanceServiceNavigation");
    fillField(service, serviceTitle, services, view.serviceFilter || "");
    fillField(mode, t("viewModeLabel"), translate(modes), view.mode);
    const sortTitle = t(flat ? "sortModeFlatLabel" : "sortModeLabel");
    const sortChoices = sorts.filter(([id]) => flat || !id.startsWith("name"));
    const sortValue = flat ? view.flatSort : view.groupedItemSort;
    fillField(sort, sortTitle, translate(sortChoices), sortValue);
    groupSort.label.hidden = flat;
    const groupTitle = t("groupSortLabel");
    fillField(groupSort, groupTitle, translate(groupSorts), view.groupSort);
  }
  function render(next) {
    if (!live) return;
    // A new session: drop the menu and messages of the old one.
    if (next.epochs.session !== snapshot.epochs.session) say("");
    if (next.epochs.session !== snapshot.epochs.session || next.host.dialogOpen)
      closeMenu(false);
    snapshot = next;
    lang = next.preferences.resolvedLanguage || "en";
    surface.lang = lang;
    surface.dataset.reducedMotion = String(
      next.preferences.reducedMotion === true,
    );
    surface.dataset.otpAnimation = next.preferences.otpAnimation || "none";
    setText(accountsTitle, text("accounts"));
    setText(manageTitle, text("manage"));
    setText(manage, text(managePage.hidden ? "manage" : "back"));
    syncHostAppearance();
    renderToolbar();
    renderAccounts();
    renderStates();
    renderOperations();
    renderMenu();
    renderAbout();
  }

  // ---- Appearance: theme settings and, optionally, the host's dialogs ----
  function applySettings(next) {
    settings = next?.settings || {};
    // Customise: read your theme.config.js settings here.
    surface.dataset.density =
      settings.density === "compact" ? "compact" : "comfortable";
  }
  // Optional: colours the host's own dialogs, menus and toasts to match (see
  // src/hostAppearance.js). Older hosts lack setAppearance. Delete this
  // function and its call to keep the default dialogs.
  function syncHostAppearance() {
    if (typeof sdk.host.setAppearance !== "function") return;
    const dark = snapshot.preferences.resolvedTheme === "dark";
    const tokens = hostAppearance(settings, dark);
    if (JSON.stringify(tokens) === lastAppearance) return;
    lastAppearance = JSON.stringify(tokens);
    sdk.host.setAppearance(tokens);
  }

  // ---- Account menu ----
  function closeMenu(restoreFocus = true) {
    if (!openMenu) return;
    const card = openMenu;
    openMenu = null;
    card.actions.hidden = true;
    card.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && card.trigger.isConnected) card.trigger.focus();
  }
  function toggleMenu(card) {
    if (openMenu === card) return closeMenu();
    closeMenu(false);
    openMenu = card;
    card.actions.hidden = false;
    card.trigger.setAttribute("aria-expanded", "true");
  }

  // ---- Pages: …/accounts (the default) and …/manage ----
  // The search sits in the header but belongs to the account list: it shows
  // on the accounts page while signed in.
  function syncSearch() {
    const hide = !managePage.hidden || snapshot.session.state === "logged-out";
    if (hide) keepFocus(searchForm);
    searchForm.hidden = hide;
  }
  function showPage(focus = false) {
    const managing = window.location.hash === route + "manage";
    // Focus inside the page that hides moves to the page that shows.
    const leaving = managing ? accountsPage : managePage;
    const move =
      focus || (!leaving.hidden && leaving.contains(document.activeElement));
    managePage.hidden = !managing;
    accountsPage.hidden = managing;
    syncSearch();
    setText(manage, text(managing ? "back" : "manage"));
    if (managing) closeMenu(false);
    if (move && !snapshot.host.dialogOpen)
      (managing ? manageTitle : accountsTitle).focus({ preventScroll: true });
  }

  // ---- Events ----
  function onClick(event) {
    const trigger = event.target.closest?.("[data-action]");
    if (!live || !trigger || !surface.contains(trigger) || trigger.disabled)
      return;
    const { action, value } = trigger.dataset;
    const id = trigger.closest("[data-account]")?.dataset.account;
    const item = id && account(id);
    if (action !== "menu" && !trigger.closest(".tpl-account-menu"))
      closeMenu(false);
    if (action === "copy" || action === "next")
      copy(id, action === "next" ? "next" : "current");
    else if (action === "menu") toggleMenu(cards.get(id));
    else if (["qr", "edit", "delete"].includes(action)) {
      if (item) host({ kind: "account-" + action, account: item.ref }, trigger);
    } else if (action === "uri" || action === "link") {
      closeMenu();
      const name = item?.service.label;
      if (action === "uri" && item)
        observe(
          sdk.accounts.copyURI(item.ref),
          t("coreCopiedUriService", { name }),
        );
      else if (item)
        observe(
          sdk.accounts.copyShareLink(item.ref),
          t("coreCopiedLinkService", { name }),
        );
    } else if (action === "host") {
      // Take the host's own request for the action (e.g. a settings section).
      const descriptors = sdk.host.listActions();
      const known = descriptors.find((entry) => entry.actionId === value);
      host(known?.request || { kind: value }, trigger);
    } else if (action === "scheme") {
      const dark = snapshot.preferences.resolvedTheme === "dark";
      observe(sdk.preferences.set({ theme: dark ? "light" : "dark" }));
    } else if (action === "refresh") observe(sdk.accounts.refresh());
    else if (action === "reconcile")
      observe(sdk.otp.reconcile(value), "", value);
    else if (action === "reload") observe(sdk.lifecycle.requestReload(value));
    else if (action === "clear") {
      sdk.view.setQuery("");
      sdk.view.setServiceFilter(null);
      search.value = "";
      search.focus();
    } else if (action === "route") {
      window.location.hash =
        route + (managePage.hidden ? "manage" : "accounts");
      showPage(true);
    }
  }
  function onKeyDown(event) {
    if (snapshot.host.dialogOpen || event.isComposing) return;
    const target = event.target;
    const list = target.closest(".tpl-account-menu");
    if (event.key === "Escape" && openMenu) {
      event.preventDefault();
      closeMenu();
    } else if (
      target.dataset.action === "menu" &&
      /^Arrow(Up|Down)$/.test(event.key)
    ) {
      // Arrow keys on ⋯ open the menu and move into it.
      event.preventDefault();
      const card = cards.get(target.closest("[data-account]").dataset.account);
      if (openMenu !== card) toggleMenu(card);
      card.actions.querySelector("button")?.focus();
    } else if (list && /^(Arrow(Up|Down)|Home|End)$/.test(event.key)) {
      event.preventDefault();
      const items = [...list.querySelectorAll("button:not(:disabled)")];
      const at = items.indexOf(target);
      const to = { Home: 0, End: -1, ArrowDown: at + 1, ArrowUp: at - 1 };
      items.at(to[event.key] % items.length)?.focus();
    }
  }
  listen(surface, "click", onClick);
  listen(surface, "keydown", onKeyDown);
  listen(searchForm, "submit", (event) => event.preventDefault());
  // Wait for IME composition (Chinese, Japanese…) to finish before searching.
  listen(search, "input", (event) => {
    if (!event.isComposing) sdk.view.setQuery(search.value);
  });
  listen(search, "compositionend", () => sdk.view.setQuery(search.value));
  listen(toolbar, "change", ({ target }) => {
    const { setting } = target.dataset;
    const flat = snapshot.library.view.mode === "flat";
    if (setting === "service") sdk.view.setServiceFilter(target.value || null);
    else if (setting === "mode") sdk.view.setMode(target.value);
    else if (setting === "groupSort")
      sdk.view.setSort({ groupSort: target.value });
    else
      sdk.view.setSort({
        [flat ? "flatSort" : "groupedItemSort"]: target.value,
      });
  });
  // A click or focus outside the open account menu closes it.
  const outside = ({ target }) =>
    openMenu && !openMenu.node.contains(target) && closeMenu(false);
  listen(document, "pointerdown", outside);
  listen(document, "focusin", outside);
  listen(window, "hashchange", () => showPage(false));

  applySettings(appearance);
  showPage(false);
  const unsubscribe = sdk.subscribe(render); // delivers the snapshot at once
  const timer = window.setInterval(() => live && renderTime(), 250);

  function unmount() {
    if (!live) return;
    live = false;
    unsubscribe();
    events.abort();
    window.clearInterval(timer);
    window.clearTimeout(noticeTimer);
    signal?.removeEventListener("abort", unmount);
    surface.remove();
    cards.clear();
  }
  signal?.addEventListener("abort", unmount, { once: true });
  return {
    // Same package, new settings: the host may call update() or remount.
    update(next) {
      if (!live) return;
      applySettings(next);
      render(snapshot);
    },
    unmount,
  };
}
