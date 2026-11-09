import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { journeyModel, type JourneySnapshot } from '../lib/journey';
import { assertOwner, ownerRpc } from './api';
import { useOwner } from './auth';

const confirmations = new Set<string>();

export async function fetchJourney(owner: string, sync = false, current?: () => boolean): Promise<JourneySnapshot> {
  const s = await ownerRpc<JourneySnapshot>(owner, sync ? 'titan_journey_sync_v1' : 'titan_journey_snapshot_v1', {}, current);
  await assertOwner(owner);
  if (!journeyModel(s, owner)) throw Error('JOURNEY_RECEIPT_INVALID');
  return s;
}

/** Opening only reads. Acquisitions require explicit single-flight confirmation. */
export function useJourney() {
  const owner = useOwner(), qc = useQueryClient(), current = useRef({ owner });
  if (current.current.owner !== owner) current.current = { owner };
  const [op, setOp] = useState<{ owner: string; busy: boolean; error: string | null }>({ owner, busy: false, error: null });
  const key = ['journey', owner];
  const enabled = !!owner && !owner.startsWith('guest_');
  const q = useQuery({ queryKey: key, queryFn: () => fetchJourney(owner), staleTime: 60000, retry: false, enabled });
  const sync = async () => {
    const account = current.current;
    const isCurrent = () => current.current === account;
    if (!enabled || account.owner !== owner || confirmations.has(owner)) return;
    confirmations.add(owner);
    setOp({ owner, busy: true, error: null });
    try {
      await qc.cancelQueries({ queryKey: key, exact: true });
      const s = await fetchJourney(owner, true, isCurrent);
      // Invalidation during confirmation can start a read of the previous snapshot.
      await qc.cancelQueries({ queryKey: key, exact: true });
      if (!isCurrent()) return;
      qc.setQueryData(key, s);
      return s;
    } catch {
      if (isCurrent()) setOp({ owner, busy: false, error: 'La confirmation est indisponible. Tes découvertes acquises sont conservées.' });
    } finally {
      confirmations.delete(owner);
      if (isCurrent()) setOp(v => ({ ...v, busy: false }));
    }
  };
  return { snapshot: q.data?.owner === owner ? q.data : null, loading: q.isPending && q.isFetching, busy: op.owner === owner && op.busy, error: (op.owner === owner ? op.error : null) || (q.error ? 'Les sentiers sont momentanément indisponibles.' : null), refresh: () => q.refetch(), sync };
}
