import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { journeyModel, type JourneySnapshot } from '../lib/journey';
import { assertOwner, ownerRpc } from './api';
import { useOwner } from './auth';

export async function fetchJourney(owner: string, sync = false): Promise<JourneySnapshot> {
  const s = await ownerRpc<JourneySnapshot>(owner, sync ? 'titan_journey_sync_v1' : 'titan_journey_snapshot_v1', {});
  await assertOwner(owner);
  if (!journeyModel(s, owner)) throw Error('JOURNEY_RECEIPT_INVALID');
  return s;
}

/** Opening only reads. Acquisitions require explicit single-flight confirmation. */
export function useJourney() {
  const owner = useOwner(), qc = useQueryClient(), current = useRef(owner);
  current.current = owner;
  const flight = useRef<string | null>(null);
  const [op, setOp] = useState<{ owner: string; busy: boolean; error: string | null }>({ owner, busy: false, error: null });
  const q = useQuery({ queryKey: ['journey', owner], queryFn: () => fetchJourney(owner), staleTime: 60000, retry: false, enabled: !!owner && !owner.startsWith('guest_') });
  const sync = async () => {
    if (flight.current === owner) return;
    flight.current = owner; setOp({ owner, busy: true, error: null });
    try {
      await qc.cancelQueries({ queryKey: ['journey', owner] });
      const s = await fetchJourney(owner, true);
      if (current.current !== owner) return;
      qc.setQueryData(['journey', owner], s);
      return s;
    } catch {
      if (current.current === owner) setOp({ owner, busy: false, error: 'La confirmation est indisponible. Tes découvertes acquises sont conservées.' });
    } finally {
      if (flight.current === owner) flight.current = null;
      if (current.current === owner) setOp(v => v.owner === owner ? { ...v, busy: false } : v);
    }
  };
  return { snapshot: q.data?.owner === owner ? q.data : null, loading: q.isPending && q.isFetching, busy: op.owner === owner && op.busy, error: (op.owner === owner ? op.error : null) || (q.error ? 'Les sentiers sont momentanément indisponibles.' : null), refresh: () => q.refetch(), sync };
}
