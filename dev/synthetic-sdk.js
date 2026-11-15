/** Development-only fixture. This file is never included in the theme archive. */
export function createSyntheticSdk({ onCall = () => {} } = {}) {
  const listeners = new Set();
  const calls = [];
  const appearances = [];
  const started = performance.now();
  const origin = 59000;
  let revision = 0;
  const descriptors = [
    ["account-add", "fabAddSecret"],
    ["account-edit", "cardMenuEdit", "account"],
    ["account-delete", "cardMenuDelete", "account"],
    ["account-qr", "cardMenuQRCode", "account"],
    ["scan-import", "fabScanQR"],
    ["import", "fabImport"],
    ["export", "fabExport"],
    ["backup", "fabBackup"],
    ["tools", "fabTools"],
    ...[
      ["qr-decode", "toolQrDecodeTitle"],
      ["qr-generate", "toolQrGenTitle"],
      ["base32", "toolBase32Title"],
      ["timestamp", "pageTimestampTitle"],
      ["key-check", "toolKeyCheckerTitle"],
      ["key-generate", "toolKeyGenTitle"],
    ].map(([tool, key]) => ["tool", key, null, { tool }]),
    ...[
      ["security", "settingsTabSecurity"],
      ["sync", "settingsTabSync"],
      ["preferences", "settingsTabPreferences"],
      ["custom-code", "settingsTabCustomCode"],
    ].map(([section, key]) => ["settings", key, null, { section }]),
    ...[
      ["webdav", "syncWebdavTitle"],
      ["s3", "syncS3Title"],
      ["onedrive", "syncOneDriveTitle"],
      ["gdrive", "syncGoogleDriveTitle"],
    ].map(([provider, key]) => ["sync-provider", key, null, { provider }]),
    ["appearance", "appearanceTitle"],
    // The host lists About after the theme settings.
    ["settings", "settingsTabAbout", null, { section: "about" }],
    ["recovery", "appearanceSafeMode"],
    ["hidden-accounts", "pageHiddenAccounts"],
    ["offline-queue", "offlineQueueView"],
    ["offline-queue-edit", "offlineQueueEditRetry", "operationId"],
    ["offline-queue-retry", "retry", "operationId"],
    ["offline-queue-cancel", "offlineQueueCancelChange", "operationId"],
    ["offline-queue-status-retry", "restoreRefresh"],
    ["extension", "pageBrowserExtension"],
    ["pwa-install", "pwaInstallBtn"],
    ["quick-otp", "appTitle"],
    // The host lists signing in and out last.
    ["login", "loginSubmitBtn"],
    ["logout", "logoutBtn"],
  ].map(([kind, labelKey, requires, params = {}]) => ({
    actionId:
      kind + (Object.values(params)[0] ? ":" + Object.values(params)[0] : ""),
    labelKey,
    requires: requires || null,
    enabled: true,
    reason: null,
    request: { kind, ...params },
  }));
  const labels = {
    loginSubmitBtn: "Sign in",
    logoutBtn: "Sign out",
    fabAddSecret: "Add account",
    cardMenuEdit: "Edit",
    cardMenuDelete: "Delete",
    cardMenuQRCode: "QR code",
    cardMenuCopyURI: "Copy URI",
    cardMenuCopyLink: "Copy link",
    fabScanQR: "Scan QR code",
    fabImport: "Import",
    fabExport: "Export",
    fabBackup: "Backups",
    fabTools: "Tools",
    toolQrDecodeTitle: "Decode QR code",
    toolQrGenTitle: "Generate QR code",
    toolBase32Title: "Base32",
    pageTimestampTitle: "Timestamp",
    toolKeyCheckerTitle: "Check key",
    toolKeyGenTitle: "Generate key",
    settingsTabSecurity: "Security",
    settingsTabPreferences: "Preferences",
    settingsTabSync: "Sync",
    settingsTabCustomCode: "Custom code",
    settingsTabAbout: "About",
    pageDocumentation: "Documentation",
    pageFeedback: "Report an issue",
    aboutSourceCode: "Source code",
    versionUpdateAvailable: "🆕 New version available: {version}",
    syncWebdavTitle: "WebDAV",
    syncS3Title: "S3",
    syncOneDriveTitle: "OneDrive",
    syncGoogleDriveTitle: "Google Drive",
    appearanceTitle: "Appearance",
    appearanceSafeMode: "Safe mode",
    pageHiddenAccounts: "Hidden accounts",
    offlineQueueView: "Pending changes",
    offlineQueueEditRetry: "Edit pending change",
    retry: "Retry",
    offlineQueueCancelChange: "Cancel change",
    restoreRefresh: "Refresh",
    pageBrowserExtension: "Browser extension",
    pwaInstallBtn: "Install app",
    appTitle: "Quick OTP",
  };
  let snapshot = {
    revision,
    epochs: { session: 1, data: 1, clock: 1 },
    session: { state: "authenticated", accessVerified: true },
    library: {
      state: "ready",
      source: "server",
      refreshState: "idle",
      errorKey: null,
      hidden: { count: 0, records: [] },
      accounts: [
        [
          "google",
          "Google",
          "design.team@example.invalid",
          "008 421".replace(" ", ""),
          "312099",
        ],
        ["github", "GitHub", "theme-author", "014206", "723021"],
        [
          "long",
          "Long service name for responsive testing",
          "a-very-long-account-name@synthetic.example.invalid",
          "00123456",
          "12345678",
        ],
        ["hotp", "Hardware token", "Demo HOTP", "755224", null],
        ["empty", "Cloud console", "", "173922", "013577"],
        [
          "unicode",
          "示例工作室",
          "示例账户 / Sample studio",
          "205914",
          "509226",
        ],
      ].map(([id, service, accountLabel, current, next]) => ({
        ref: { id, generation: 1 },
        service: { label: service, groupId: service },
        accountLabel,
        type: id === "hotp" ? "HOTP" : "TOTP",
        digits: current.length,
        algorithm: "SHA1",
        period: 30,
        counter: id === "hotp" ? 0 : undefined,
        otp: {
          state: "ready",
          displayRevision: 1,
          current: {
            value: current,
            validFrom: 30000,
            validUntil: 60000,
            copyAvailability: "ready",
          },
          next: next
            ? {
                value: next,
                validFrom: 60000,
                validUntil: 90000,
                copyAvailability: "ready",
              }
            : null,
        },
        availableActions: [
          "copy",
          "next",
          "qr",
          "uri",
          "link",
          "edit",
          "delete",
        ],
      })),
      view: {
        query: "",
        mode: "grouped",
        serviceFilter: null,
        flatSort: "oldest-first",
        groupedItemSort: "oldest-first",
        groupSort: "name-asc",
        total: 6,
        found: 6,
        resultIds: [],
        groups: [],
        services: [],
      },
    },
    connectivity: { onlineHint: true, serverState: "verified" },
    clock: { status: "synced", generation: 1, correctedNow: origin },
    queue: { operations: [], busy: false },
    preferences: {
      language: "en",
      resolvedLanguage: "en",
      theme: "light",
      resolvedTheme: "light",
      defaultViewMode: "remember",
      otpAnimation: "none",
      reducedMotion: false,
    },
    host: {
      operations: [],
      pendingWrites: 0,
      busy: false,
      dialogOpen: false,
      // The host version and project links; older hosts have none (null).
      about: {
        version: "1.13.1",
        latestVersion: null,
        upToDate: true,
        author: "wuzf",
        license: "MIT",
        links: {
          documentation: "https://github.com/wuzf/2fa/blob/main/README.md",
          feedback: "https://github.com/wuzf/2fa/issues",
          source: "https://github.com/wuzf/2fa",
          releases: "https://github.com/wuzf/2fa/releases/latest",
          author: "https://github.com/wuzf",
        },
      },
    },
  };
  function record(method, value) {
    calls.push({ method, value });
    onCall(method, value);
  }
  function derive() {
    const view = snapshot.library.view;
    const all = snapshot.library.accounts;
    const services = new Map();
    for (const account of all) {
      const { groupId, label } = account.service;
      if (!services.has(groupId))
        services.set(groupId, { groupId, label, count: 0, ids: [] });
      const group = services.get(groupId);
      group.count += 1;
      group.ids.push(account.ref.id);
    }
    view.services = [...services.values()];
    if (view.serviceFilter && !services.has(view.serviceFilter))
      view.serviceFilter = null;
    const selected = all.filter(
      (account) =>
        (!view.query ||
          (account.service.label + " " + account.accountLabel)
            .toLowerCase()
            .includes(view.query.toLowerCase())) &&
        (!view.serviceFilter || account.service.groupId === view.serviceFilter),
    );
    const sort = view.mode === "flat" ? view.flatSort : view.groupedItemSort;
    if (sort === "newest-first") selected.reverse();
    else if (
      ["name-asc", "name-desc", "account-asc", "account-desc"].includes(sort)
    ) {
      const text = (account) =>
        sort.startsWith("name-") ? account.service.label : account.accountLabel;
      selected.sort(
        (a, b) =>
          (sort.endsWith("desc") ? -1 : 1) * text(a).localeCompare(text(b)),
      );
    }
    view.resultIds = selected.map((account) => account.ref.id);
    const groups = new Map();
    for (const account of selected) {
      const { groupId, label } = account.service;
      if (!groups.has(groupId))
        groups.set(groupId, {
          groupId,
          label,
          ids: [],
          matchedCount: 0,
          totalCount: services.get(groupId).count,
        });
      const group = groups.get(groupId);
      group.ids.push(account.ref.id);
      group.matchedCount += 1;
    }
    view.groups = [...groups.values()].sort(
      (a, b) =>
        (view.groupSort === "name-desc" ? -1 : 1) *
        a.label.localeCompare(b.label),
    );
    view.total = all.length;
    view.found = selected.length;
  }
  let published;
  function emit() {
    derive();
    snapshot.revision = ++revision;
    published = structuredClone(snapshot);
    listeners.forEach((listener) => listener(published));
  }
  function viewChange(method, patch) {
    record("view." + method, patch);
    Object.assign(snapshot.library.view, patch);
    emit();
    return { status: "committed" };
  }
  const tickets = new WeakSet();
  const sdk = {
    identity: {
      mode: "preview",
      sdkApiVersion: 1,
      packageId: "synthetic-template-fixture",
      hostBuild: "synthetic",
    },
    getSnapshot: () => published,
    subscribe(fn) {
      listeners.add(fn);
      fn(published);
      return () => listeners.delete(fn);
    },
    clock: { now: () => origin + performance.now() - started },
    view: {
      setQuery: (query) => viewChange("setQuery", { query }),
      setMode: (mode) => viewChange("setMode", { mode }),
      setServiceFilter: (serviceFilter) =>
        viewChange("setServiceFilter", { serviceFilter }),
      setSort: (patch) => viewChange("setSort", patch),
    },
    otp: {
      readCopyTarget(id, slot = "current") {
        const account = snapshot.library.accounts.find(
            (item) => item.ref.id === id,
          ),
          code = account?.otp[slot];
        if (!code || code.copyAvailability !== "ready")
          return { status: "not-ready", reason: "not-ready" };
        const target = Object.freeze({
          accountId: id,
          slot,
          value: code.value,
        });
        tickets.add(target);
        return { status: "ready", target };
      },
      copy(target) {
        if (!tickets.has(target))
          throw new Error("The exact SDK ticket must be preserved");
        record("otp.copy", target);
        return Promise.resolve({
          status: "settled",
          clipboard: "copied",
          reservation: "not-attempted",
        });
      },
      reconcile: (id) => {
        record("otp.reconcile", id);
        return Promise.resolve({ status: "committed" });
      },
    },
    accounts: {
      refresh() {
        record("accounts.refresh");
        return Promise.resolve({ status: "loaded" });
      },
      copyURI(ref) {
        record("accounts.copyURI", ref);
        return Promise.resolve({ status: "settled", clipboard: "copied" });
      },
      copyShareLink(ref) {
        record("accounts.copyShareLink", ref);
        return Promise.resolve({ status: "settled", clipboard: "copied" });
      },
    },
    host: {
      setAppearance(tokens) {
        const value = structuredClone(tokens);
        appearances.push(value);
        onCall("host.setAppearance", value);
        return { status: "completed" };
      },
      listActions: () => descriptors,
      open(request, options) {
        record("host.open", { request, options });
        return {
          status: "opening",
          closed: Promise.resolve({ status: "closed" }),
        };
      },
    },
    preferences: {
      set(patch) {
        record("preferences.set", patch);
        Object.assign(snapshot.preferences, patch);
        if (patch.language)
          snapshot.preferences.resolvedLanguage =
            patch.language === "auto" ? "en" : patch.language;
        if (patch.theme)
          snapshot.preferences.resolvedTheme =
            patch.theme === "auto" ? "light" : patch.theme;
        emit();
        return Promise.resolve({ status: "committed" });
      },
    },
    i18n: {
      t: (key, params) => {
        let text = labels[key] || key;
        for (const [name, value] of Object.entries(params || {}))
          text = text.replaceAll("{" + name + "}", String(value));
        return text;
      },
    },
    lifecycle: {
      requestReload(reason) {
        record("lifecycle.requestReload", reason);
        return Promise.resolve({
          status: "rejected",
          reason: "synthetic-only",
        });
      },
    },
  };
  emit();
  return {
    sdk,
    calls,
    appearances,
    emit,
    get listeners() {
      return listeners.size;
    },
    get state() {
      return snapshot;
    },
    replace(next) {
      snapshot = next;
      emit();
    },
  };
}
