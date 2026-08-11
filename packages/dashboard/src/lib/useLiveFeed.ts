import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLiveStore } from "./liveStore";
import type { ContractChangeView, EndpointView } from "@schema-watch/ui";

interface WsEvent {
  type: "change";
  payload: ContractChangeView;
}

const RECONNECT_DELAY_MS = 2000;

/** Owns the single WebSocket connection to the agent and fans live events into
 * the React Query cache (so every panel updates without polling) and, for
 * breaking changes, into the toast queue. */
export function useLiveFeed() {
  const queryClient = useQueryClient();
  const setStatus = useLiveStore((s) => s.setStatus);
  const pushToast = useLiveStore((s) => s.pushToast);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let socket: WebSocket;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      socket.onopen = () => setStatus("open");

      socket.onmessage = (event) => {
        const message: WsEvent = JSON.parse(event.data);
        if (message.type !== "change") return;
        const change = message.payload;

        queryClient.setQueryData<ContractChangeView[]>(["changes"], (prev) =>
          prev ? [change, ...prev] : [change],
        );
        queryClient.setQueryData<EndpointView[]>(["endpoints"], (prev) =>
          prev?.map((e) =>
            e.id === change.endpointId
              ? { ...e, latestSeverity: change.severity, changeCount: e.changeCount + 1, lastSeenAt: change.createdAt }
              : e,
          ),
        );

        if (change.severity === "BREAKING") pushToast(change);
      };

      socket.onclose = () => {
        setStatus("closed");
        if (!cancelled) reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, [queryClient, setStatus, pushToast]);
}
