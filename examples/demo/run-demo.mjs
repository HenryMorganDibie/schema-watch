import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One command that makes Schema-Watch demonstrable to someone who has never
 * seen it: starts a mock backend, points the agent at it, drives traffic, and
 * opens the dashboard. Roughly ten seconds in, the mock backend "ships" a
 * breaking change and the alerts land live while the viewer is watching.
 *
 * Everything runs in a temp directory, so the demo never litters the repo.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const agentCli = path.join(repoRoot, "packages", "agent", "dist", "cli.js");

const API_PORT = 4570;
const PROXY_PORT = 4560;
const DASHBOARD_PORT = 4561;

if (!existsSync(agentCli)) {
  console.error("Agent is not built yet. Run this first:\n\n  npm run build\n");
  process.exit(1);
}

// A fake frontend so the "which files are affected" feature has something to
// find. These reference the demo endpoints the way real app code would.
const workdir = mkdtempSync(path.join(tmpdir(), "schema-watch-demo-"));
const frontendSrc = path.join(workdir, "frontend", "src");
mkdirSync(path.join(frontendSrc, "components"), { recursive: true });
mkdirSync(path.join(frontendSrc, "pages"), { recursive: true });

const FAKE_FILES = {
  "components/UserCard.tsx": 'const res = await fetch(`/api/users/${id}`);\nexport const UserCard = () => <div>{res.userId}</div>;\n',
  "components/UsersTable.tsx": 'useQuery(["users"], () => fetch("/api/users/" + id).then(r => r.json()));\n',
  "pages/Profile.tsx": 'const { data } = useSWR(`/api/users/${userId}`, fetcher);\n',
  "pages/Orders.tsx": 'fetch(`/api/orders/${orderId}`).then(r => r.json());\n',
  "pages/Checkout.tsx": 'await fetch("/api/orders/" + orderId, { method: "PATCH" });\n',
  "pages/Dashboard.tsx": 'useSWR("/api/projects", fetcher);\n',
  "components/Unrelated.tsx": 'export const Unrelated = () => <div>touches no API</div>;\n',
};
for (const [rel, contents] of Object.entries(FAKE_FILES)) {
  writeFileSync(path.join(frontendSrc, rel), contents);
}

writeFileSync(
  path.join(workdir, "schema-watch.config.json"),
  JSON.stringify(
    {
      target: `http://localhost:${API_PORT}`,
      proxyPort: PROXY_PORT,
      apiPort: DASHBOARD_PORT,
      dbPath: path.join(workdir, "demo.db"),
      frontendSrcDir: frontendSrc,
      sync: { enabled: false },
    },
    null,
    2,
  ),
);

const children = [];
function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", shell: false, ...options });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[demo] ${name} exited with code ${code}`);
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("\n  Schema-Watch demo\n  =================\n");

start("mock api", process.execPath, [path.join(here, "mock-api.mjs")], {
  env: { ...process.env, DEMO_API_PORT: String(API_PORT) },
});

setTimeout(() => {
  start("agent", process.execPath, [agentCli, "start"], { cwd: workdir });
}, 700);

// Drive traffic so the dashboard fills up without anyone clicking anything.
setTimeout(async () => {
  const paths = ["/api/users/42", "/api/orders/1001", "/api/session", "/api/projects"];
  console.log(`\n  Open http://localhost:${DASHBOARD_PORT} - traffic is flowing.`);
  console.log("  In a few seconds the mock backend ships a breaking change.\n");
  console.log("  Ctrl+C to stop.\n");

  setInterval(async () => {
    for (const p of paths) {
      try {
        await fetch(`http://localhost:${PROXY_PORT}${p}`);
      } catch {
        // agent may still be starting; the next tick will catch up
      }
    }
  }, 2500);
}, 2200);
