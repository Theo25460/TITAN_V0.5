import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/* One source of truth for connectivity: TanStack Query pauses requests offline and resumes them when the device
   reconnects; screens read the same flag to explain when an action needs Internet. */
let online = true;
const listeners = new Set<(v: boolean) => void>();

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    const next = state.isConnected !== false && state.isInternetReachable !== false;
    online = next;
    setOnline(next);
    listeners.forEach((l) => l(next));
  }),
);

export const isOnline = () => online;

export function useOnline() {
  const [value, setValue] = useState(online);
  useEffect(() => {
    listeners.add(setValue);
    setValue(online);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export function onReconnect(cb: () => void) {
  let previous = online;
  const l = (v: boolean) => {
    if (v && !previous) cb();
    previous = v;
  };
  listeners.add(l);
  return () => listeners.delete(l);
}
