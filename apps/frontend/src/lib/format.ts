export const shortAddress = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h?: string | null) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

export function formatDateTime(iso: string | number | null | undefined) {
  if (iso === null || iso === undefined) return "—";
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Format a decimal-string or number weight with thousands separators. */
export function formatWeight(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "—";
  try {
    return BigInt(v).toLocaleString("en-US");
  } catch {
    return String(v);
  }
}

export function percentOf(part: string | number | null | undefined, whole: string | number | null | undefined) {
  if (part === null || part === undefined || whole === null || whole === undefined) return 0;
  const w = BigInt(whole);
  if (w === 0n) return 0;
  return Number((BigInt(part) * 10_000n) / w) / 100;
}

export function relativeTime(iso: string) {
  const diff = Date.parse(iso) - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(Math.round(diff / 1000), "second");
}

/** Value for <input type="datetime-local"> from a Date (local time). */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
