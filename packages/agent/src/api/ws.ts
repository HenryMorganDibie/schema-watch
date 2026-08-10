import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { agentEvents } from "../events.js";
import { serializeChange } from "./serialize.js";

/** Live feed for the dashboard: every new ContractChange is pushed the instant
 * capture.ts detects it, so the UI never has to poll. */
export function attachWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  agentEvents.onChange((change) => {
    const message = JSON.stringify({ type: "change", payload: serializeChange(change) });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  });

  return wss;
}
