"use client";

import { useLocale } from "next-intl";
import { api } from "@/lib/trpc/react";
import {
  firstNameOf,
  greetNameForLocale,
  gendered,
  normalizeGender,
  type Gender,
} from "@/lib/personal-address";

/**
 * Client hook for personalized, gendered address. Reads the cached profile
 * (getProfile) — no extra request on pages that already load it.
 *   const { greetName, g } = usePersonalAddress();
 *   <h1>{greetName ? `היי ${greetName}` : "היי"}</h1>
 *   <p>{g("מוזמן", "מוזמנת", "מוזמן/ת") + " להתחיל"}</p>
 */
export function usePersonalAddress(): {
  firstName: string | null;
  /** First name safe to show in the CURRENT locale (Hebrew rejects Latin names). */
  greetName: string | null;
  gender: Gender;
  /** Gendered pick; unknown gender → the neutral fallback (today's copy). */
  g: (male: string, female: string, neutral: string) => string;
} {
  const isHe = useLocale() === "he";
  const { data } = api.user.getProfile.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const firstName = firstNameOf(data ?? null);
  const gender = normalizeGender(data?.gender ?? null);
  return {
    firstName,
    greetName: greetNameForLocale(data ?? null, isHe),
    gender,
    g: (male, female, neutral) => gendered(gender, { m: male, f: female, n: neutral }),
  };
}
