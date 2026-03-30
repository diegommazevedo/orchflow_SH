import { QueryClient } from '@tanstack/react-query'

/** Instância única — usada pelo `QueryClientProvider` e pelo interceptor 401 em `api.ts`. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})
