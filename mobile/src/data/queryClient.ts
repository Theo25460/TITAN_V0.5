import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { toAppError } from "../lib/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 7 * 24 * 3600_000,
      // Offline: show the last known data instead of an error, refetch when the connection returns.
      networkMode: "offlineFirst",
      retry: (count, error) => {
        const e = toAppError(error);
        return !e.permanent && e.code !== "AUTH_REQUIRED" && count < 2;
      },
      refetchOnReconnect: true,
    },
    mutations: { networkMode: "online", retry: false },
  },
});

/* Small server answers (profile, adventure, goals, Atelier, community) are kept on the device between launches.
   The training log has its own chunked cache (logsCache.ts). Every query key starts with the owner id. */
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "titan.query-cache.v1", throttleTime: 2000 });
export const PERSIST_BUSTER = "titan-android-1";
export const shouldPersist = (key: readonly unknown[]) => key[0] !== "logs" && key[0] !== "export";
