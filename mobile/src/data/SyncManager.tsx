/* Keeps the device and the server in step: sends waiting sessions at start-up, when the app comes back to the
   foreground and when the connection returns; then refreshes what those sessions changed. */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import { onReconnect } from "../lib/network";
import { useAuth } from "./auth";
import { keys, syncNow } from "./hooks";

export function SyncManager() {
  const { owner } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!owner) return;
    const run = () => {
      syncNow(qc, owner).catch(() => {});
    };
    run();
    const off = onReconnect(() => {
      run();
      qc.invalidateQueries({ queryKey: keys.logs(owner) });
    });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        run();
        qc.invalidateQueries({ queryKey: keys.adventure(owner) });
      }
    });
    return () => {
      off();
      sub.remove();
    };
  }, [owner, qc]);
  return null;
}
