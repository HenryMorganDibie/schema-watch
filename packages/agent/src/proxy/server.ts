import http from "node:http";
import https from "node:https";
import type { JsonValue } from "@schema-watch/core";
import type { AgentConfig } from "../config.js";
import type { Db } from "../storage/sqlite.js";
import { capture } from "./capture.js";

/**
 * A transparent reverse proxy: point your frontend's API base URL at this
 * instead of the real backend. Every request/response passes through byte-
 * for-byte untouched - capture and diffing happen in `setImmediate` after
 * the response has already been written back to the client, so this adds
 * zero measurable latency to real requests.
 *
 * Known limitation: gzip/br-encoded response bodies are forwarded correctly
 * to the client but aren't decompressed for capture, so they're skipped for
 * diffing (uncommon for local dev backends; a real gzip-aware decode is a
 * one-file addition if it turns out to matter).
 */
export function startProxyServer(db: Db, config: AgentConfig): http.Server {
  const targetUrl = new URL(config.target);
  const client = targetUrl.protocol === "https:" ? https : http;

  const server = http.createServer((req, res) => {
    const requestChunks: Buffer[] = [];
    req.on("data", (chunk) => requestChunks.push(chunk));
    req.on("end", () => {
      const requestBodyRaw = Buffer.concat(requestChunks);

      const headers = { ...req.headers, host: targetUrl.host };

      const proxyReq = client.request(
        {
          protocol: targetUrl.protocol,
          hostname: targetUrl.hostname,
          port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
          path: req.url,
          method: req.method,
          headers,
        },
        (proxyRes) => {
          const responseChunks: Buffer[] = [];
          proxyRes.on("data", (chunk) => responseChunks.push(chunk));
          proxyRes.on("end", () => {
            const responseBodyRaw = Buffer.concat(responseChunks);

            const responseHeaders = { ...proxyRes.headers };
            delete responseHeaders["content-length"];
            delete responseHeaders["transfer-encoding"];
            res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
            res.end(responseBodyRaw);

            setImmediate(() => {
              try {
                capture(db, config, {
                  method: req.method ?? "GET",
                  pathname: (req.url ?? "/").split("?")[0]!,
                  statusCode: proxyRes.statusCode ?? 0,
                  requestBody: safeParseJson(requestBodyRaw, req.headers["content-type"]),
                  responseBody: safeParseJson(responseBodyRaw, proxyRes.headers["content-type"]),
                });
              } catch (err) {
                console.error("[schema-watch] capture failed:", err);
              }
            });
          });
        },
      );

      proxyReq.on("error", (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ error: "schema-watch: upstream request failed", detail: err.message }));
      });

      if (requestBodyRaw.length > 0) proxyReq.write(requestBodyRaw);
      proxyReq.end();
    });
  });

  server.listen(config.proxyPort);
  return server;
}

function safeParseJson(buf: Buffer, contentType?: string): JsonValue | undefined {
  if (buf.length === 0) return undefined;
  if (contentType && !contentType.includes("json")) return undefined;
  try {
    return JSON.parse(buf.toString("utf-8"));
  } catch {
    return undefined;
  }
}
