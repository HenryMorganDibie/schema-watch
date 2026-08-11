import type { IncomingMessage, ServerResponse } from "node:http";
// Imports the compiled output rather than src: `vercel-build` runs tsc before
// Vercel compiles this function, and keeping api/ outside the tsc rootDir
// avoids fighting the build over which tool owns which files.
import { buildApp } from "../dist/app.js";

/**
 * Vercel serverless entry point.
 *
 * Fastify normally owns its own HTTP server; here Vercel owns the socket and
 * hands us a request, so the app is built once per warm instance and requests
 * are injected into its internal server. `app.ready()` resolves instantly
 * after the first call, so warm invocations skip the whole plugin boot.
 */
const app = buildApp();
const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ready;
  app.server.emit("request", req, res);
}
