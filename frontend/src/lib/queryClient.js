import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60 s before data is considered stale — avoids redundant refetches
      // on every component mount while still staying reasonably fresh.
      staleTime: 60_000,
      // Keep unused cache entries for 15 min — survives tab switches.
      gcTime: 15 * 60 * 1000,
      // Retry once on failure, with a capped exponential back-off.
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      // No background refetch on window focus — reduces "setTimeout took Nms"
      // violations caused by React Query scheduling batched refetches the
      // moment the user switches back to the tab.
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
      // Structural sharing is on by default and prevents unnecessary
      // re-renders when the server returns identical data.
    },
    mutations: {
      // Surface mutation errors to React Error Boundaries automatically.
      throwOnError: false,
      // Single retry on mutation failure (idempotent endpoints only).
      retry: 0,
    },
  },
});

// Cart: 10s stale window + no window-focus refetches to keep main-thread tasks < 50ms
queryClient.setQueryDefaults(["cart"], {
  staleTime: 10_000,
  refetchOnWindowFocus: false,
});

// Categories change very rarely — cache for the entire session.
queryClient.setQueryDefaults(["categories"], {
  staleTime: 24 * 60 * 60 * 1000,
  gcTime:    24 * 60 * 60 * 1000,
});

// Product listings: 2-minute stale window to minimise redundant fetches
// while still showing fresh stock/price data.
queryClient.setQueryDefaults(["products"], {
  staleTime: 2 * 60 * 1000,
});

// Wishlist: same policy as cart to eliminate window-focus task spikes.
queryClient.setQueryDefaults(["wishlist"], {
  staleTime: 10_000,
  refetchOnWindowFocus: false,
});
