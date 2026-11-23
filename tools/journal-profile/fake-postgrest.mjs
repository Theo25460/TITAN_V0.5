// V1.6.6 — a small in-memory PostgREST for training_logs, enough for the journal benchmark and its browser journeys: select of
// columns, eq/neq/gt/gte/lt/lte/in/is filters, or=(…) and and(…) groups, order on several columns, offset/limit and Range,
// Prefer: count=exact with a Content-Range header. The network model charges each answer one round trip plus its gzip size over
// the chosen bandwidth, as a phone on a weak connection would receive it (Supabase answers gzip-compressed JSON).
import { gzipSync } from "node:zlib";

const PROFILES = {
  local: { rtt: 0, bytesPerSecond: Infinity, label: "local, sans latence" },
  // « Peu de réseau »: 300 ms of round trip and 1.6 Mbit/s down, the Fast 3G profile of Chrome DevTools rounded.
  faible: { rtt: 300, bytesPerSecond: 200_000, label: "faible : 300 ms d’aller-retour, 1,6 Mbit/s" },
};
export const networkProfile = (name) => PROFILES[name] || PROFILES.local;

function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const unquote = (v) => v.replace(/^"|"$/g, "");
function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
}
function test(row, col, op, raw) {
  const v = row[col];
  const val = unquote(raw);
  switch (op) {
    case "eq": return String(v) === val;
    case "neq": return String(v) !== val;
    case "gt": return v !== null && v !== undefined && cmp(v, val) > 0;
    case "gte": return v !== null && v !== undefined && cmp(v, val) >= 0;
    case "lt": return v !== null && v !== undefined && cmp(v, val) < 0;
    case "lte": return v !== null && v !== undefined && cmp(v, val) <= 0;
    case "in": return splitTop(raw.replace(/^\(|\)$/g, "")).map(unquote).includes(String(v));
    case "is": return val === "null" ? v === null || v === undefined : String(v) === val;
    default: throw new Error(`operator ${op}`);
  }
}
// "date.lt.X" or "and(date.eq.X,id.lt.Y)" inside or=(…)
function group(row, expr) {
  const m = /^(and|or)\((.*)\)$/.exec(expr);
  if (m) {
    const parts = splitTop(m[2]);
    return m[1] === "and" ? parts.every((p) => group(row, p)) : parts.some((p) => group(row, p));
  }
  const [col, op, ...rest] = expr.split(".");
  return test(row, col, op, rest.join("."));
}

export function query(rows, url, headers = {}) {
  const p = url.searchParams;
  let list = rows;
  for (const [key, value] of p) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    if (key === "or" || key === "and") { list = list.filter((r) => group(r, `${key}${value}`)); continue; }
    const [op, ...rest] = value.split(".");
    list = list.filter((r) => test(r, key, op, rest.join(".")));
  }
  const order = (p.get("order") || "").split(",").filter(Boolean).map((o) => { const [c, dir] = o.split("."); return [c, dir === "desc" ? -1 : 1]; });
  if (order.length) list = [...list].sort((a, b) => { for (const [c, d] of order) { const x = cmp(a[c], b[c]); if (x) return x * d; } return 0; });
  const total = list.length;
  let offset = Number(p.get("offset") || 0), limit = p.has("limit") ? Number(p.get("limit")) : Infinity;
  const range = /^(\d+)-(\d+)$/.exec(headers.range || "");
  if (range) { offset = Number(range[1]); limit = Number(range[2]) - offset + 1; }
  const page = list.slice(offset, offset + limit);
  const cols = (p.get("select") || "*").split(",");
  const body = cols.includes("*") ? page : page.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  const exact = /count=exact/.test(headers.prefer || "");
  const contentRange = `${page.length ? `${offset}-${offset + page.length - 1}` : "*"}/${exact ? total : "*"}`;
  return { body, total, contentRange };
}

/** Delay of one answer on the network profile: one round trip plus the gzip size over the bandwidth. */
export function delayOf(profile, text) {
  if (!profile.rtt && profile.bytesPerSecond === Infinity) return { ms: 0, gz: 0 };
  const gz = gzipSync(text).length;
  return { ms: profile.rtt + (gz / profile.bytesPerSecond) * 1000, gz };
}
