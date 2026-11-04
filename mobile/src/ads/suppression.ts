/* A tutorial stays active while its Guide screen remains in the navigation stack, including visits to real screens.
   Scoped by account; multiple guide instances release only their own suppression. */
const active = new Map<string, Set<symbol>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const adsSuppression = {
  get: (owner: string) => (active.get(owner)?.size ?? 0) > 0,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  begin(owner: string) {
    const lease = Symbol();
    const leases = active.get(owner) ?? new Set<symbol>();
    leases.add(lease);
    active.set(owner, leases);
    emit();
    return () => {
      leases.delete(lease);
      if (!leases.size) active.delete(owner);
      emit();
    };
  },
};
