// Public surface for the "AI context brief" feature - the CLI `context`
// command and `@schema-watch/mcp` both consume this instead of reaching into
// agent internals directly.
export { buildContextBrief, type ContextBrief, type ContextBriefEndpoint, type ContextBriefBreakingChange, type ContextBriefFrontendReference } from "./brief.js";
export { renderContextBriefMarkdown } from "./markdown.js";
export { writeContextFile, upsertFencedBlock } from "./write.js";
export { loadConfig, type AgentConfig } from "../config.js";
export { openDatabase, type Db } from "../storage/sqlite.js";
export { findAffectedFiles } from "../proxy/affectedFiles.js";
