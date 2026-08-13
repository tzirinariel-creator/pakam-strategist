"use client";

import { useLocale } from "next-intl";

/**
 * "Where do I get the sheet?" (#30) — the answer lives in ONE place (the design
 * line's "every fact lives once") and is reused by the scanner, the dashboard
 * end-of-semester card, and both onboarding scan steps. A quiet <details>, not
 * a banner: the student who already knows where the file is never has to read
 * past one line.
 *
 * HONESTY RULE for this copy. The only things stated as fact are the ones we
 * can actually stand behind:
 *   · the document's name — "אישור קורסים וציונים" — is the real one; the owner
 *     sent the genuine PDF and the parser is written against it.
 *   · it is a PDF you download, and it can run to more than one page.
 *   · a photo/screenshot of the grades table works, and a heavy PDF may need to
 *     be photographed instead — both are enforced by the upload path itself.
 * TAU's own menu labels are NOT reproduced here. They differ per faculty and
 * change between years, so inventing a click-path ("Studies → Confirmations")
 * would send students hunting for a menu that may not exist. Step 1 therefore
 * tells them WHERE to look and WHAT to search for, and says so plainly.
 * If you ever verify the exact path first-hand, add it here — not anywhere else.
 */
export function WhereIsMySheet() {
  const isHe = useLocale() === "he";

  const steps = isHe
    ? [
        <>
          מתחברים לאזור האישי לתלמיד באתר אוניברסיטת תל אביב, ומחפשים את החלק של
          האישורים והמסמכים. השם המדויק של התפריט משתנה בין פקולטות ובין שנים, אז
          לכו לפי המילה <b className="font-semibold text-foreground/75">אישורים</b>.
        </>,
        <>
          מוציאים משם את המסמך{" "}
          <b className="font-semibold text-foreground/75">אישור קורסים וציונים</b> —
          זה הגיליון הרשמי, עם טבלה של מספר-קורס, שם, ציון ומשקל.
        </>,
        <>
          מורידים אותו כ־PDF ומעלים כאן. גם צילום-מסך או תמונה חדה של טבלת
          הציונים עובדים בדיוק אותו דבר.
        </>,
      ]
    : [
        <>
          Sign in to the personal student area on the Tel Aviv University site and
          look for the confirmations / documents section. The exact menu wording
          differs between faculties and years, so search for the word{" "}
          <b className="font-semibold text-foreground/75">confirmations</b>.
        </>,
        <>
          Get the document called{" "}
          <b className="font-semibold text-foreground/75">אישור קורסים וציונים</b>{" "}
          (record of courses and grades) — the official sheet, with a table of
          course number, name, grade and weight.
        </>,
        <>
          Download it as a PDF and upload it here. A screenshot or a sharp photo
          of the grades table works exactly the same.
        </>,
      ];

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs text-accent-brand underline-offset-2 hover:underline">
        {isHe ? "איפה משיגים את הגיליון?" : "Where do I get the sheet?"}
      </summary>
      <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-foreground/55">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-bold text-foreground/50">
              {i + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs leading-relaxed text-foreground/45">
        {isHe
          ? "הגיליון יכול להתפרס על כמה עמודים — אפשר להעלות עמוד אחרי עמוד, סריקה חוזרת מעדכנת ולא משכפלת. אם ה-PDF כבד מדי, צלמו את העמוד עצמו. שום דבר לא נשמר בלי שתאשרו שורה-שורה."
          : "The sheet can run to several pages — upload them one after another; a repeat scan updates rather than duplicates. If the PDF is too heavy, photograph the page itself. Nothing is saved until you approve it row by row."}
      </p>
    </details>
  );
}
