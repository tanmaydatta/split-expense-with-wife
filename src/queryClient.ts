import { QueryClient } from "@tanstack/react-query";

// Singleton QueryClient for the app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});


