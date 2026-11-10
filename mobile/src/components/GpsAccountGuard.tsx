import { useEffect, useRef } from "react";
import { useAuth } from "../data/auth";
import { guardAccount } from "../lib/gpsNative";

/** Renders nothing; pauses a GPS recording that belongs to a previous account. */
export function GpsAccountGuard() {
  const { owner, status } = useAuth();
  const known = useRef(false);
  useEffect(() => {
    if (!known.current && status === "loading") return;
    known.current = true;
    guardAccount(owner ?? null).catch(() => {});
  }, [owner, status]);
  return null;
}
