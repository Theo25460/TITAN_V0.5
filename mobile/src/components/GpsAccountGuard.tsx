import { useEffect } from "react";
import { useAuth } from "../data/auth";
import { guardAccount } from "../lib/gpsNative";

/** Renders nothing; pauses a GPS recording that belongs to a previous account. */
export function GpsAccountGuard() {
  const { owner } = useAuth();
  useEffect(() => {
    guardAccount(owner ?? null).catch(() => {});
  }, [owner]);
  return null;
}
