import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * Computes something heavy after the screen has been painted, so the first frame is not blocked by it.
 * Returns undefined until the value is ready; recomputes when `deps` change.
 */
export function useAfterPaint<T>(compute: () => T, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setValue(compute()));
    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
