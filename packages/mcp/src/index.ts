#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  loadConfig,
  openDatabase,
  buildContextBrief,
  renderContextBriefMarkdown,
  findAffectedFiles,
} from "@schema-watch/agent/context";

// StdioServerTransport owns stdin/stdout for JSON-RPC framing - never
// console.log here or anywhere in the imported context module, it would
// corrupt the protocol stream. Diagnostics go to stderr only.

const cwd = process.env.SCHEMA_WATCH_CWD ?? process.cwd();
const config = loadConfig({ cwd });
// busy_timeout: this process opens the same schema-watch.db the proxy writes
// to; WAL makes concurrent reads safe, this just tolerates a transient lock.
const db = openDatabase(config.dbPath, { timeout: 2000 });

const server = new McpServer({ name: "schema-watch-mcp", version: "0.1.0" });

server.registerResource(
  "context-brief",
  "schema-watch://context",
  {
    description: "Current API surface, recent breaking changes, and frontend cross-references, captured by Schema-Watch",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: renderContextBriefMarkdown(buildContextBrief(db, config)),
      },
    ],
  }),
);

server.registerTool(
  "get_context_brief",
  {
    description: "Structured JSON: captured API endpoints, recent breaking contract changes, and frontend files that reference them",
    inputSchema: { limit: z.number().int().positive().max(200).optional() },
  },
  async ({ limit }) => {
    const brief = buildContextBrief(db, config, { limit });
    return {
      content: [{ type: "text", text: JSON.stringify(brief, null, 2) }],
      // ContextBrief has no index signature; the SDK's tool result type
      // needs one for arbitrary structured payloads.
      structuredContent: brief as unknown as Record<string, unknown>,
    };
  },
);

server.registerTool(
  "list_recent_breaking_changes",
  {
    description: "Most recent BREAKING API contract changes only, newest first",
    inputSchema: { limit: z.number().int().positive().max(200).optional() },
  },
  async ({ limit }) => {
    const brief = buildContextBrief(db, config, { limit });
    return { content: [{ type: "text", text: JSON.stringify(brief.breakingChanges, null, 2) }] };
  },
);

server.registerTool(
  "find_affected_files",
  {
    description: "Which frontend files reference this endpoint path right now (requires frontendSrcDir in schema-watch.config.json)",
    inputSchema: { pathPattern: z.string() },
  },
  async ({ pathPattern }) => {
    if (!config.frontendSrcDir) {
      return { content: [{ type: "text", text: "No frontendSrcDir configured in schema-watch.config.json." }] };
    }
    const files = findAffectedFiles(config.frontendSrcDir, pathPattern);
    return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
