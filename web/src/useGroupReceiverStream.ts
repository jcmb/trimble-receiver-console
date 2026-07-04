import { useEffect, useState } from "react";
import { wsStreamUrl } from "./appPaths";
import type { ReceiverSnapshot } from "./types";

export function useGroupReceiverStream(groupId: string | null): ReceiverSnapshot[] {
  const [receivers, setReceivers] = useState<ReceiverSnapshot[]>([]);

  useEffect(() => {
    if (!groupId) {
      setReceivers([]);
      return;
    }
    const ws = new WebSocket(wsStreamUrl(groupId));
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
