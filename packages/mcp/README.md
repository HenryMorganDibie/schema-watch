# @schema-watch/mcp

A local MCP server that exposes the same captured API context as
`schema-watch context` (endpoints, recent breaking changes, frontend
cross-references), live, over stdio - so an MCP-aware coding agent (Claude
Code, Cursor) can pull current state at the start of a session instead of
reading a file that goes stale the moment the contract changes again.

Local only, free, no account or network access required. Reads the same
`schema-watch.config.json` and `schema-watch.db` the agent CLI already
produces in the target project.

## Build

```bash
npm run build --workspace packages/mcp
```

## Register with an MCP client

Point the client's MCP config at the built server, with `cwd` set to the
project you want context from (the one containing `schema-watch.config.json`
and `schema-watch.db`):

```json
{
  "mcpServers": {
    "schema-watch": {
      "command": "node",
      "args": ["/absolute/path/to/schema-watch/packages/mcp/dist/index.js"],
      "cwd": "/absolute/path/to/your-project"
    }
  }
}
```

For Claude Code, this goes in `.mcp.json` at the project root (or via
`claude mcp add`). Cursor uses the same shape under its own MCP settings.

## What it exposes

- **Resource** `schema-watch://context` - the full brief as markdown, meant
  to be auto-attached at session start by clients that support it.
- **Tool** `get_context_brief(limit?)` - the same data as structured JSON,
  for clients that don't auto-attach resources.
- **Tool** `list_recent_breaking_changes(limit?)` - just the breaking-change
  history.
- **Tool** `find_affected_files(pathPattern)` - runs the affected-component
  grep on demand for one endpoint path (requires `frontendSrcDir` set in
  `schema-watch.config.json`).

## Notes

- WAL mode (which the agent already enables) makes it safe for this server to
  read `schema-watch.db` while the proxy is writing to it in another process.
  Keep `dbPath` on local disk - WAL over a network share (SMB, a mapped
  drive) is unsupported by SQLite itself, not a schema-watch limitation.
- Nothing here is guessed. The brief is strictly what Schema-Watch has
  actually captured - endpoints, contract drift, affected files - no inferred
  naming conventions or architecture summary.
