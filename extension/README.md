# Chrome DevTools extension - phase 2

Not built yet, by design (see `ARCHITECTURE.md` §1 and §9) - the local agent +
dashboard is where the core loop (capture → diff → alert → affected files)
gets proven first. This directory is a placeholder for when that's validated.

## Why this is additive, not a rewrite

The dashboard already talks to the agent purely over `http://localhost:4561`
REST + `/ws`. A DevTools panel is a second thin client against the same API:

1. `manifest.json` registers a `devtools_page` that creates a panel via
   `chrome.devtools.panels.create("Schema-Watch", ...)`.
2. The panel iframe loads the same React components already built in
   `packages/dashboard/src/components` (`Timeline`, `DiffViewer`,
   `SeverityBadge`) - they'd move to `packages/core-ui` and get imported by
   both the Vite dashboard and the extension bundle, rather than being
   rewritten.
3. Auth: local mode needs none (same-origin `localhost`); cloud mode reuses
   the JWT from `packages/server`, stored via `chrome.storage.local`.

## What it adds over the web dashboard

- Correlates a contract change with the specific network request in Chrome's
  own Network panel (via `chrome.devtools.network.onRequestFinished`),
  something a separate browser tab can't do.
- No context switch - stays open next to the app you're already debugging.

## Scope for the first version

- Read-only: view live changes and diffs, same as the dashboard's Timeline
  and DiffViewer.
- No proxy management from inside the extension - the agent still runs from
  the CLI; the extension is a viewer, not a second copy of the capture logic.
