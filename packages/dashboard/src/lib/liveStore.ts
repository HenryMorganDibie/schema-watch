import { create } from "zustand";
import type { ContractChangeView } from "@schema-watch/ui";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface ToastItem {
  id: string;
  change: ContractChangeView;
}

interface LiveState {
  status: ConnectionStatus;
  toasts: ToastItem[];
  setStatus: (status: ConnectionStatus) => void;
  pushToast: (change: ContractChangeView) => void;
  dismissToast: (id: string) => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  status: "connecting",
  toasts: [],
  setStatus: (status) => set({ status }),
  pushToast: (change) =>
    set((state) => ({
      toasts: [...state.toasts, { id: `${change.id}-${Date.now()}`, change }].slice(-4),
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
