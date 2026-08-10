import { EventEmitter } from "node:events";
import type { ChangeRow } from "./storage/queries.js";

export interface ChangeEvent extends ChangeRow {
  method: string;
  path_pattern: string;
}

class AgentEvents extends EventEmitter {
  emitChange(change: ChangeEvent) {
    this.emit("change", change);
  }
  onChange(listener: (change: ChangeEvent) => void) {
    this.on("change", listener);
  }
}

export const agentEvents = new AgentEvents();
