import { useEffect, useState } from "react";
import type { ReceiverSnapshot } from "./types";

export function useGroupReceiverStream(groupId: string | null): ReceiverSnapshot[] {
  const [receivers, setReceivers] = useState<ReceiverSnapshot[]>([]);

  useEffect(() => {
    if (!groupId) {
      setReceivers([]);
      return;
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const u = `${proto}//${location.host}/api/stream?group=${encodeURIComponent(groupId)}`;
    const ws = new WebSocket(u);
    ws.onmessage = (ev) => {
      try {
        const j = JSON.parse(ev.data);
        if (Array.isArray(j.receivers)) setReceivers(j.receivers);
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [groupId]);

  return receivers;
}
