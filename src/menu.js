/* The management page ("Manage"): which host actions it lists, in which group
   and in which order. This file is the place to make the menu your own:
   rename the groups (their names are the group* strings in src/i18n.js),
   move entries between groups, change the order, or split a group. theme.js
   only draws what buildMenu() returns.

   Keep these rules (tests/menu-order.test.js checks them):
   - "scheme", the theme's own light/dark switch, opens the settings group;
   - "settings:about" comes straight after "appearance";
   - signing in or out ("login" / "logout") is the last entry of the menu;
   - no two entries show the same label;
   - an action that a later 2FA version adds still appears: it takes the "*"
     place of the closest group, so nothing gets lost after an update. */

/** The groups, top to bottom. */
export const groups = ["data", "tools", "settings", "app"];

const toolIds = [
  "tool:qr-decode",
  "tool:qr-generate",
  "tool:base32",
  "tool:timestamp",
  "tool:key-check",
  "tool:key-generate",
];
const providerIds = [
  "sync-provider:webdav",
  "sync-provider:s3",
  "sync-provider:onedrive",
  "sync-provider:gdrive",
];

/** Each group's entries in order, by host actionId (see sdk.host.listActions()
    or docs/THEME_APP_SDK.md in the 2FA repository). "*" is where actions the
    theme does not know yet go. */
export const groupOrder = {
  data: ["scan-import", "account-add", "import", "export", "backup", "*"],
  tools: ["tools", ...toolIds, "quick-otp", "*"],
  settings: [
    "scheme",
    "settings:security",
    "settings:sync",
    ...providerIds,
    "settings:preferences",
    "settings:custom-code",
    "*",
    "appearance",
    "settings:about",
  ],
  app: ["extension", "pwa-install", "*", "login", "logout"],
};

/* Actions that the host lists but a menu should not repeat. Account actions
   (requires: "account") live in each account's own menu and queue actions
   (requires: "operationId") in the pending-changes panel. Hidden accounts and
   the offline queue get a button in the status area when there is something to
   show, and safe mode ("recovery") is offered by the host's own error bar. */
const shownElsewhere = new Set([
  "recovery",
  "hidden-accounts",
  "offline-queue",
  "offline-queue-status-retry",
]);

/** Host label keys to use instead of an action's own labelKey: these two read
    as a status sentence and as the app title, not as something to click. */
export const labelOverrides = {
  "quick-otp": "quickOtpTitle",
  recovery: "appearanceUseDefault",
};

/** The group an action belongs to. Unknown actions join by their prefix:
    "settings:…" and "sync-provider:…" go to settings, "tool:…" to tools, and
    anything else to app. */
export function groupOf(actionId) {
  for (const group of groups)
    if (groupOrder[group].includes(actionId)) return group;
  if (/^(settings|sync-provider):/.test(actionId)) return "settings";
  if (actionId.startsWith("tool:")) return "tools";
  return "app";
}

/** An action's place within its group; unknown actions take the "*" place. */
export function menuRank(group, actionId) {
  const order = groupOrder[group];
  const index = order.indexOf(actionId);
  return index < 0 ? order.indexOf("*") : index;
}

/** The menu for the current host actions and session:
    [{ group, entries: [action, …] }, …]. The "scheme" entry has only an
    actionId; the others are the host's action descriptors, unchanged. */
export function buildMenu(actions, { session, installAvailable }) {
  const enabled = new Set(
    actions.filter((action) => action.enabled).map((action) => action.actionId),
  );
  const entries = actions.filter((action) => {
    if (action.requires || shownElsewhere.has(action.actionId)) return false;
    // "Tools" and "Sync" each open a page listing all of their items; the
    // single items are listed only when that page is unavailable.
    if (toolIds.includes(action.actionId)) return !enabled.has("tools");
    if (providerIds.includes(action.actionId))
      return !enabled.has("settings:sync");
    if (action.actionId === "login") return session === "logged-out";
    if (action.actionId === "logout") return session !== "logged-out";
    // The browser offers installing only now and then.
    if (action.actionId === "pwa-install")
      return installAvailable === true && action.enabled;
    return true;
  });
  entries.unshift({ actionId: "scheme" });
  return groups.map((group) => ({
    group,
    entries: entries
      .filter((entry) => groupOf(entry.actionId) === group)
      .sort(
        (a, b) => menuRank(group, a.actionId) - menuRank(group, b.actionId),
      ),
  }));
}
