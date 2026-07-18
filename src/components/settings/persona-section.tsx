"use client";

import { Drama } from "lucide-react";
import { useLocale } from "next-intl";
import { PersonaPicker } from "@/components/persona/persona-picker";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Advisor Persona Section — same brain, two voices (device-local for now)
// ---------------------------------------------------------------

export function PersonaSection() {
  const isHe = useLocale() === "he";
  return (
    <SectionCard
      icon={Drama}
      title={isHe ? "דמות היועץ" : "Advisor persona"}
      description={isHe ? "אותם נתונים, אותם כללים — קול אחר. ההחלפה חלה מההודעה הבאה." : "Same data, same rules — a different voice. Applies from the next message."}
    >
      {/* Q5 (notes 17/48): shared picker incl. the Plato origin story — the same
          component the onboarding finale uses, so the choice lives once. */}
      <PersonaPicker />
    </SectionCard>
  );
}
