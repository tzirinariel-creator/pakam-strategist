"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import superjson from "superjson";
import { useState, type ReactNode } from "react";
import type { AppRouter } from "@/server/trpc/router";

export const api = createTRPCReact<AppRouter>();

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchOnWindowFocus: false,
            // Ariel, 2.9, with a screenshot: "לא הצלחנו לטעון את התוכנית" on
            // the home screen. Reads had ONE retry, and this database is a
            // Supabase instance that goes cold — a first request after a quiet
            // spell can lose the race, and two in a row is an ordinary Tuesday,
            // not an outage. One retry turned that into a red error card as the
            // first thing a student sees.
            //
            // Two retries with React Query's exponential backoff costs about
            // three seconds in the genuinely-broken case and removes the common
            // transient one. Mutations deliberately keep retry:false below — a
            // write must never be replayed on our guess that it failed.
            retry: 2,
          },
          mutations: {
            // Mutations don't auto-retry by default — keep that
            retry: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            return {
              "x-trpc-source": "react",
            };
          },
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
