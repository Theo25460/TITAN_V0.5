import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

let current = false;
const listeners = new Set<(v: boolean) => void>();
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    current = v;
    listeners.forEach((l) => l(v));
  })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
  current = v;
  listeners.forEach((l) => l(v));
});

/** Honour the system "remove animations" setting. */
export function useReducedMotion() {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
export const reducedMotion = () => current;
