import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptics";
import { useReducedMotion } from "../lib/motion";
import { colors, radius, space } from "../theme/tokens";
import { Icon } from "./Icon";
import { T } from "./Text";

type Toast = { id: number; kind: "ok" | "err" | "info" | "warn"; title: string; message?: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const counter = useRef(0);
  const show = useCallback((t: Omit<Toast, "id">) => {
    counter.current += 1;
    setToast({ ...t, id: counter.current });
    haptic(t.kind === "ok" ? "success" : t.kind === "err" ? "error" : "light");
    AccessibilityInfo.announceForAccessibility([t.title, t.message].filter(Boolean).join(". "));
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDone={() => setToast((c) => (c?.id === toast.id ? null : c))} /> : null}
    </Ctx.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(reduced ? 0 : 40)).current;
  const o = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!reduced) Animated.parallel([Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 220, useNativeDriver: true })]).start();
    const t = setTimeout(onDone, toast.message ? 4200 : 2800);
    return () => clearTimeout(t);
  }, [o, y, onDone, reduced, toast.message]);
  const tint = { ok: colors.ok, err: colors.err, info: colors.cy, warn: colors.warn }[toast.kind];
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 92, opacity: o, transform: [{ translateY: y }] }]}>
      <View style={[styles.toast, { borderColor: tint }]}>
        <Icon name={toast.kind === "ok" ? "check" : toast.kind === "err" ? "alert" : "info"} size={20} color={tint} />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong">{toast.title}</T>
          {toast.message ? <T variant="small">{toast.message}</T> : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: space.s4, right: space.s4 },
  toast: { flexDirection: "row", gap: space.s3, alignItems: "center", padding: space.s4, borderRadius: radius.r2, backgroundColor: colors.bg3, borderWidth: 1, elevation: 8 },
});
