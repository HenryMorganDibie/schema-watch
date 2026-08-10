import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copies the built dashboard into the agent package so a published
// `npx schema-watch start` serves the UI with no extra install step.
const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "../../dashboard/dist");
const dest = path.resolve(here, "../dashboard-dist");

if (!existsSync(source)) {
  console.error(`Dashboard build not found at ${source}. Run "npm run build --workspace packages/dashboard" first.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
console.log(`Bundled dashboard into ${path.relative(process.cwd(), dest)}`);
