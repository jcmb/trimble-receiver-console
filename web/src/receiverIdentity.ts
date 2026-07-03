import type { ReceiverSnapshot } from "./types";

/** host:port when serial / RET SERIAL are unavailable (outbound dials, anonymous inbound). */
export function receiverEndpointLabel(r: ReceiverSnapshot): string {
  const ck = r.connection_key?.trim();
  if (ck?.startsWith("out:")) return ck.slice(4);
  if (ck?.startsWith("anon:")) return ck.slice(5);

  const ra = r.remote_addr?.trim() ?? "";
  if (ra.startsWith("→ ")) return ra.slice(2).trim();
  if (ra) return ra;

  return "—";
}

/** Primary list/map label: serial when known, else IP:port (or TCP remote). */
export function displayReceiverLabel(r: ReceiverSnapshot): string {
  const long = r.dcol_ret_serial?.long_serial?.trim();
  if (long) return long;
  const short = r.dcol_ret_serial?.receiver_serial_short?.trim();
  if (short) return short;
  const s = r.serial?.trim();
  if (s) return s;
  return receiverEndpointLabel(r);
}

/** Sort key for the Serial column — matches displayReceiverLabel precedence. */
export function receiverSortKey(r: ReceiverSnapshot): string {
  return displayReceiverLabel(r).toLowerCase();
}

export function receiverKey(r: ReceiverSnapshot): string {
  if (r.connection_key?.trim()) return r.connection_key.trim();
  if (r.serial?.trim()) return r.serial.trim();
  if (r.remote_addr.startsWith("→ ")) return `out:${r.remote_addr.slice(2).trim()}`;
  return `anon:${r.remote_addr}`;
}
