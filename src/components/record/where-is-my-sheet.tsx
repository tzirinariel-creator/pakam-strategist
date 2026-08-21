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
 * change between years, so inventing a click-path would send students hunting
 * for a menu that may not exist. The old version therefore described a vague
 * "confirmations" section — and was WRONG.
 *
 * CORRECTED 21.8 from Ariel's own screenshots of my.tau.ac.il, which is the
 * first-hand verification this comment used to ask for. The sheet is not
 * downloaded from a documents area at all: ציונים → the "גליון ציונים" link
 * with the envelope icon → a dialog (degree / language / email) → and TAU
 * EMAILS you the PDF. Students were being sent to look for a download button
 * that does not exist.
 *
 * If the path changes again, correct it HERE — not anywhere else.
 */
export function WhereIsMySheet() {
  const isHe = useLocale() === "he";

  const steps = isHe
    ? [
        <>
          נכנסים ל<b className="font-semibold text-foreground/75">אזור האישי</b> של
          ת״א (my.tau.ac.il), ובתפריט הצד לוחצים על{" "}
          <b className="font-semibold text-foreground/75">ציונים</b>.
        </>,
        <>
          מעל רשימת הציונים יש קישור קטן עם אייקון מעטפה —{" "}
          <b className="font-semibold text-foreground/75">גליון ציונים</b>. לוחצים
          עליו.
        </>,
        <>
          נפתח חלון: בוחרים <b className="font-semibold text-foreground/75">תואר ראשון</b>,
          בוחרים <b className="font-semibold text-foreground/75">עברית</b>, ומוודאים
          שהמייל שמופיע הוא שלכם. לוחצים <b className="font-semibold text-foreground/75">שליחה</b>.
        </>,
        <>
          הגיליון מגיע אליכם <b className="font-semibold text-foreground/75">במייל</b> תוך
          כמה דקות, כקובץ PDF. שומרים אותו ומעלים כאן — או פשוט גוררים אותו ישר מהמייל.
        </>,
      ]
    : [
        <>
          Sign in to the TAU <b className="font-semibold text-foreground/75">personal area</b>{" "}
          (my.tau.ac.il) and click <b className="font-semibold text-foreground/75">ציונים</b>{" "}
          (Grades) in the sidebar.
        </>,
        <>
          Above the grade list there's a small link with an envelope icon —{" "}
          <b className="font-semibold text-foreground/75">גליון ציונים</b>. Click it.
        </>,
        <>
          A dialog opens: choose{" "}
          <b className="font-semibold text-foreground/75">תואר ראשון</b>, choose{" "}
          <b className="font-semibold text-foreground/75">עברית</b>, check the email
          shown is yours, and press <b className="font-semibold text-foreground/75">שליחה</b>.
        </>,
        <>
          The sheet arrives <b className="font-semibold text-foreground/75">by email</b>{" "}
          within a few minutes, as a PDF. Save it and upload it here — or drag it
          straight out of the email.
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
