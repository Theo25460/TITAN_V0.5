/* Server feature flags for the signed-in account (public.titan_feature_flags_v1, resolved per account with its rollout).
   A flag that is absent, unreadable or offline reads as closed: new social features stay hidden until the owner opens them. */
import { useQuery } from "@tanstack/react-query";
import { ownerRpc } from "./api";
import { useOwner } from "./auth";

export const flagsKey = (owner: string) => ["server-flags", owner] as const;

export function useServerFlag(key: string): boolean {
  const owner = useOwner();
  const q = useQuery({
    queryKey: flagsKey(owner),
    queryFn: () => ownerRpc<{ flags?: Record<string, boolean> }>(owner, "titan_feature_flags_v1", {}),
    staleTime: 10 * 60_000,
    retry: false,
  });
  return q.data?.flags?.[key] === true;
}
