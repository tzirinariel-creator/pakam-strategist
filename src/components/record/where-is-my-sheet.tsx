"use client";

import { useLocale } from "next-intl";

/**
 * "Where do I get the sheet?" — the answer to #25, living in ONE place
 * (the design line's "every fact lives once"), reused by the scanner, the
 * onboarding history step, and the guide. A quiet <details>, not a banner.
 */
export function WhereIsMySheet() {
  const isHe = useLocale() === "he";
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs text-accent-brand underline-offset-2 hover:underline">
        {isHe ? "איפה משיגים את הגיליון?" : "Where do I get the sheet?"}
      </summary>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/55">
        {isHe
          ? "נכנסים ל'מידע אישי לתלמיד' באתר אוניברסיטת תל אביב ← מחפשים 'אישור קורסים וציונים' (תחת לימודים/אישורים) ← מורידים כ-PDF ומעלים כאן. צילום-מסך ברור של טבלת הציונים עובד בדיוק אותו דבר."
          : "Go to 'Personal student info' on the Tel Aviv University site → find 'Record of study / course confirmation' (under Studies/Confirmations) → download it as PDF and upload here. A clear screenshot of the grades table works exactly the same."}
      </p>
    </details>
  );
}
