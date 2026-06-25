"use client";

import type { ReactNode } from "react";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TRPCReactProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </TRPCReactProvider>
  );
}
