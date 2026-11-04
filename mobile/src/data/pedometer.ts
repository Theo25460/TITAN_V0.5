/* TITAN's own step counter, as the app sees it: one shared store (the QG card and the steps screen read the same numbers), per account,
   kept on the phone. It counts only while the person allowed it, only from the phone's own sensor, and only works while TITAN is open:
   the sensor is read when the app comes to the front (steps taken in between are recovered, see stepLedger) and streamed while it is
   in front, so the number moves as the person walks. Nothing runs in the background and nothing leaves the phone. */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { pedometer } from "../lib/pedometer";
import { applyReading, emptyLedger, type Ledger, type Reading } from "../lib/stepLedger";
import { ownerKey, readJSON, writeJSON } from "../lib/storage";
import { useOwner } from "./auth";

export type PedometerPermissionState = "unknown" | "granted" | "denied" | "blocked";
export type PedometerState = {
  owner: string | null;
  ready: boolean;
  /** The person switched the counter on (and it is not paused). */
  enabled: boolean;
  /** This phone has a hardware step counter. */
  supported: boolean;
  permission: PedometerPermissionState;
  ledger: Ledger;
  /** Instant of the last reading received while the app is in front: "en direct" only while this is fresh. */
  liveAt: number | null;
};

const blank = (): PedometerState => ({ owner: null, ready: false, enabled: false, supported: false, permission: "unknown", ledger: emptyLedger(), liveAt: null });
let state: PedometerState = blank();
const listeners = new Set<() => void>();
const set = (patch: Partial<PedometerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const ledgerKey = (o: string) => ownerKey("pedometer", o);
const onKey = (o: string) => ownerKey("pedometer-on", o);

let subscribers = 0;
let unwatch: (() => void) | null = null;
let appSub: { remove(): void } | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let epoch = 0;
let appActive = AppState.currentState !== "background" && AppState.currentState !== "inactive";

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const { owner, ledger } = state;
  if (owner) writeJSON(ledgerKey(owner), ledger).catch(() => {});
}
function schedulePersist() {
  if (!persistTimer) persistTimer = setTimeout(persistNow, 3000);
}

function apply(owner: string, reading: Reading) {
  // A reading that arrives after the account changed belongs to nobody any more.
  if (state.owner !== owner) return;
  set({ ledger: applyReading(state.ledger, reading), liveAt: reading.at });
  schedulePersist();
}

function dropWatch() {
  unwatch?.();
  unwatch = null;
}

function stopCounting() {
  dropWatch();
  if (state.liveAt !== null) set({ liveAt: null });
  persistNow();
}

async function startCounting() {
  const owner = state.owner;
  if (!owner || !state.ready || !state.enabled || !state.supported || state.permission !== "granted" || !appActive || subscribers === 0) return;
  dropWatch();
  const p = pedometer();
  const first = await p.read();
  if (state.owner !== owner || !appActive || subscribers === 0) return;
  if (first) apply(owner, first);
  dropWatch();
  unwatch = p.watch((r) => apply(owner, r));
}

async function load(owner: string) {
  const mine = ++epoch;
  stopCounting();
  state = { ...blank(), owner };
  const [ledger, on] = await Promise.all([readJSON<Ledger>(ledgerKey(owner), emptyLedger()), readJSON<boolean>(onKey(owner), false)]);
  if (mine !== epoch) return;
  const p = pedometer();
  const supported = p.supported();
  const granted = supported ? await p.permission() : false;
  if (mine !== epoch) return;
  set({ owner, ready: true, enabled: on === true, supported, permission: granted ? "granted" : "unknown", ledger: ledger && ledger.v === 1 ? ledger : emptyLedger() });
  startCounting().catch(() => {});
}

function onAppState(next: AppStateStatus) {
  appActive = next === "active";
  if (appActive) startCounting().catch(() => {});
  else stopCounting();
}

/** `explain` is TITAN's own dialog, shown only when Android is about to ask (permission not granted yet); declining it asks nothing. */
async function enable(explain?: () => Promise<boolean>): Promise<"granted" | "denied" | "blocked" | "unsupported" | "cancelled"> {
  const owner = state.owner;
  const p = pedometer();
  if (!owner) return "denied";
  if (!p.supported()) {
    set({ supported: false });
    return "unsupported";
  }
  if (explain && !(await p.permission()) && !(await explain())) return "cancelled";
  const r = await p.request();
  if (state.owner !== owner) return r;
  set({ permission: r, supported: true });
  if (r !== "granted") return r;
  await writeJSON(onKey(owner), true).catch(() => {});
  set({ enabled: true });
  startCounting().catch(() => {});
  return "granted";
}

async function disable() {
  const owner = state.owner;
  if (!owner) return;
  stopCounting();
  set({ enabled: false });
  await writeJSON(onKey(owner), false).catch(() => {});
}

/** Pause the counter and forget the steps it counted on this phone. */
async function clear() {
  const owner = state.owner;
  if (!owner) return;
  await disable();
  set({ ledger: emptyLedger() });
  await writeJSON(ledgerKey(owner), emptyLedger()).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePedometer() {
  const owner = useOwner();
  const snap = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) appSub = AppState.addEventListener("change", onAppState);
    if (state.owner !== owner) load(owner).catch(() => {});
    else startCounting().catch(() => {});
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        appSub?.remove();
        appSub = null;
        stopCounting();
      }
    };
  }, [owner]);
  const mine = snap.owner === owner ? snap : blank();
  return { ...mine, enable: useCallback(enable, []), disable: useCallback(disable, []), clear: useCallback(clear, []) };
}

/** Test helper. */
export function _resetPedometerStoreForTests() {
  epoch++;
  dropWatch();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  subscribers = 0;
  appSub?.remove();
  appSub = null;
  appActive = true;
  state = blank();
  listeners.clear();
}
