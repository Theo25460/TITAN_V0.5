/* Preview only: no network. Any write a screen attempts resolves without effect. */
const chain: Record<string, unknown> = {};
const ok = Promise.resolve({ data: null, error: null });
for (const k of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "order", "range", "limit", "gte", "lte", "single", "maybeSingle"]) chain[k] = () => chain;
chain.then = (resolve: (v: unknown) => unknown) => ok.then(resolve);

export const supabase = {
  from: () => chain,
  rpc: () => ok,
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    startAutoRefresh() {},
    stopAutoRefresh() {},
    signOut: async () => ({ error: null }),
  },
};
