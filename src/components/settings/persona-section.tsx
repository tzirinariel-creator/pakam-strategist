"use client";

import { useLocale } from "next-intl";
import { PersonaPicker } from "@/components/persona/persona-picker";
import { PersonaIcon } from "@/components/persona/use-persona";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Advisor Persona Section — same brain, two voices (device-local for now)
// ---------------------------------------------------------------

export function PersonaSection() {
  const isHe = useLocale() === "he";
  return (
    <SectionCard
      /* The section about the two brand characters is marked by the chosen
         character's own emblem — a lucide theater mask was exactly the generic
         stand-in the brand rule forbids. */
      icon={PersonaIcon}
      title={isHe ? "דמות היועץ" : "Advisor persona"}
      description={isHe ? "אותם נתונים, אותם כללים — קול אחר. ההחלפה חלה מיד, בכל האפליקציה." : "Same data, same rules — a different voice. Applies immediately, everywhere in the app."}
    >
      {/* Q5 (notes 17/48): shared picker incl. the Plato origin story — the same
          component the onboarding finale uses, so the choice lives once. */}
      <PersonaPicker />
    </SectionCard>
  );
}
