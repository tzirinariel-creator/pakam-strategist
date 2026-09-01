"use client";

import {
  GraduationCap,
  Layers,
  Compass,
  LayoutGrid,
  Shield,
  Gavel,
  Lightbulb,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";
import { DegreeInfoCard } from "@/components/onboarding/semester-planner/degree-info-card";
import { usePersona } from "@/components/persona/use-persona";
import { personaLabels } from "@/lib/persona";

/**
 * "פכמיסט מתחיל" — a friendly, accurate orientation page. Explains what the
 * degree is, how it's built, how to plan it, and which tool in the app does
 * what. Facts mirror the domain rules; numbers wrapped in <Bidi> for clean RTL.
 */
export function GuideContent() {
  const isHe = useLocale() === "he";
  const Arrow = isHe ? ArrowLeft : ArrowRight;
  // The tools list names the advisor — it must be the one the student chose.
  const { persona } = usePersona();
  const advisor = personaLabels(persona, isHe);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-6">
      {/* Hero */}
      <div className="animate-stagger-1 data-card overflow-hidden p-6 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent-brand-muted text-accent-brand">
          <GraduationCap className="size-7" />
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground/90">
          {isHe ? "פכמיסט מתחיל? מתחילים מכאן" : "New to PPE? Start here"}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-foreground/55">
          {isHe
            ? "מדריך קצר שיסביר מה זה התואר, איך הוא בנוי, ואיך לתכנן אותו חכם — בלי להילחץ."
            : "A short guide to what the degree is, how it's built, and how to plan it smartly — without the stress."}
        </p>
      </div>

      <Section icon={Compass} title={isHe ? "מה זה פכ״מ?" : "What is PPE?"}>
        <p>
          {isHe ? (
            <>
              פילוסופיה, כלכלה ומדע המדינה — תואר-הצטיינות תלת-תחומי (ולרבים גם נגיעה ב<b>משפטים</b>).{" "}
              <Bidi text="150 ש״ס" /> ב-3 שנים — <Bidi text="30 ש״ס" /> יותר מתואר רגיל, בעצם שנה שלמה דחוסה ב-3.
            </>
          ) : (
            <>Philosophy, Economics & Political science — a tri-disciplinary honors degree (often with Law too). 150 credits over 3 years — 30 more than a standard BA.</>
          )}
        </p>
        <p className="mt-1.5 text-foreground/55">
          {isHe
            ? "לומדים בשתי פקולטות, מדעי הרוח ומדעי החברה, ולצידן לימודי יסוד במשפטים. לכל פקולטה מזכירות וחוקים משלה. תחום המיקוד שתבחרו קובע גם את הסיווג שלכם בשירות המדינה."
            : "You study across two faculties, Humanities and Social Sciences, plus foundational law studies. Each faculty has its own office and rules. Your focus area even sets your civil-service track."}
        </p>
      </Section>

      <Section icon={Layers} title={isHe ? "איך התואר בנוי" : "How the degree is built"}>
        <ul className="space-y-1.5">
          <Li><Bidi text={isHe ? "103 ש״ס חובה" : "103 mandatory credits"} /> {isHe ? "— הליבה של התואר (בקטלוג הנוכחי מופיעים 101; קורס חובה עתידי בן 2 ש״ס טרם פורסם)." : "— the core (the current catalog lists 101; a 2-credit future mandatory course isn't published yet)."}</Li>
          <Li><Bidi text={isHe ? "12 ש״ס סמינרים" : "12 seminar credits"} /> {isHe ? "(3 עבודות + רפרט)." : "(3 papers + a referat)."}</Li>
          <Li><Bidi text={isHe ? "35 ש״ס בחירה" : "35 elective credits"} />.</Li>
          <Li>{isHe ? "תחום מיקוד: " : "Focus area: "}<Bidi text={isHe ? "60 ש״ס" : "60 credits"} /> {isHe ? "בתחום אחד (פילוסופיה / כלכלה / מדע המדינה)." : "in one discipline."}</Li>
          <Li>{isHe ? "2 קורסי אנגלית (תוכן), ולפי ציון האמירנט — אולי קורסי-רמה." : "2 English content courses; level courses depend on your Amirant score."}</Li>
          <Li>{isHe ? "ציון גמר = " : "Final grade = "}<Bidi text={isHe ? "78% קורסים + 18% סמינרים + 4% רפרט" : "78% courses + 18% seminars + 4% referat"} />.</Li>
        </ul>
      </Section>

      {/* #12 (12.7) — the full degree explainer used to hide inside course
          editing; every student deserves it here, whatever their stage. */}
      <section className="animate-stagger-2">
        <DegreeInfoCard />
      </section>

      <Section icon={Lightbulb} title={isHe ? "איך לתכנן חכם" : "How to plan smartly"}>
        <ul className="space-y-1.5">
          <Li>{isHe ? "שנה א׳ = קורסי חובה. אל תתחכמו — קחו הכל ותתמקדו בממוצע טוב." : "Year 1 = mandatory courses. Take them all, aim for a good GPA."}</Li>
          <Li>{isHe ? "בחרו תחום מיקוד מוקדם — הוא משפיע על כל התכנון." : "Choose your focus area early — it drives the whole plan."}</Li>
          <Li>{isHe ? "כדאי לקחת אנגלית מוקדם — קורסים קלים יחסית שמורידים עומס בהמשך." : "Take English early — relatively easy courses that ease your load later."}</Li>
          <Li>{isHe ? "קורסי החובה הכבדים כבר קבועים בסמסטר שלהם — את העומס מאזנים עם קורסי הבחירה שסביבם." : "The heavy required courses are already fixed to their semester — you balance the load with the electives around them."}</Li>
          <Li>{isHe ? "מעבר שנה: " : "Year transition: "}<Bidi text={isHe ? "ממוצע 75 כללי + 80 בקורסי פכ״מ" : "75 overall + 80 in PPE courses"} />.</Li>
          <Li>{isHe ? "בסוף כל סמסטר: מורידים 'אישור קורסים וציונים' מהאזור האישי של ת״א וסורקים אותו ב'רשומה' — כל הציונים מתעדכנים בבת-אחת." : "At each semester's end: download your 'Record of study' from the TAU personal area and scan it in 'Record' — all grades update at once."}</Li>
        </ul>
      </Section>

      <Section icon={LayoutGrid} title={isHe ? "הכלים שלכם כאן" : "Your tools here"}>
        <ul className="space-y-1.5">
          <ToolLi href="/dashboard" label={isHe ? "דשבורד — \"המצב שלי\"" : "Dashboard — \"My status\""} desc={isHe ? "מבט-על: כמה נשאר, באיזה תחום, מה חסר." : "Bird's-eye: what's left, by category."} arrow={Arrow} />
          <ToolLi href="/planner" label={isHe ? "מתכנן התואר" : "Degree planner"} desc={isHe ? "סדרו קורסים בין סמסטרים, סמנו הושלמו." : "Arrange courses across semesters."} arrow={Arrow} />
          <ToolLi href="/exam-planner" label={isHe ? "תכנון מבחנים" : "Exam planner"} desc={isHe ? "תוכנית-לימוד חכמה אחורה מכל מבחן." : "A smart reverse-planned study schedule."} arrow={Arrow} />
          <ToolLi href="/regulations" label={isHe ? "תקנון" : "Regulations"} desc={isHe ? "הסטטוס שלכם מול כל דרישות התואר." : "Your status against every requirement."} arrow={Arrow} />
          <ToolLi href="/mentor" label={advisor.name} desc={isHe ? `יועץ התואר — זמין מכל מסך דרך הכפתור הצף, עונה מהנתונים שלכם.` : "Your degree advisor — the floating button on any screen; answers from your data."} arrow={Arrow} />
          {/* #34/#41 — the guide listed every tool except the social layer, so
              a new student had no way to learn it exists or what the deal is. */}
          <ToolLi href="/lineage" label={isHe ? "השושלת" : "The Lineage"} desc={isHe ? "מה שהמחזורים שלפניכם יודעים: תיק המחזור האנונימי וחונכות בהסכמה, במקום אחד." : "What earlier cohorts know: the anonymous cohort file and consent-based mentoring, in one place."} arrow={Arrow} />
        </ul>
      </Section>

      <Section icon={Shield} title={isHe ? "מילואים" : "Reserve duty (Miluim)"}>
        <p>
          {isHe
            ? "אם שירתתם — עדכנו בהגדרות. תקבלו פטור ש״ס, אפשרות לסמן קורסים כ׳בינארי׳ (עובר/לא־עובר, יוצא מהממוצע), בחירת מועדים ועוד. פס המילואים למעלה מראה לכם תמיד מה מגיע לכם."
            : "If you served, set it in settings. You'll get credit exemptions, the option to mark courses binary (pass/fail, excluded from the average), exam-date choice, and more. The miluim bar up top always shows your benefits."}
        </p>
      </Section>

      <Section icon={Gavel} title={isHe ? "בידינג (מכרז)" : "Bidding"}>
        <p>
          {isHe
            ? "רישום לקורסים הוא מכרז: המציע הגבוה זוכה (לא כל-הקודם-זוכה). בחפיפת שעות באותו מקצה זוכה הקורס עם הניקוד הגבוה; רק במקצה השני קורס חופף מבטל שיבוץ מהמקצה הראשון. יש מסביר מלא במתכנן."
            : "Course registration is an auction: highest bidder wins. The big trap — a time-overlapping course cancels the earlier one. Full explainer in the planner."}
        </p>
      </Section>

      {/* CTA */}
      <Link
        href="/planner"
        className="animate-stagger-5 group flex items-center justify-center gap-2 rounded-xl bg-accent-brand px-5 py-3 text-sm font-semibold text-accent-brand-fg transition-colors hover:bg-accent-brand-hover"
      >
        {isHe ? "יאללה, בוא נתכנן" : "Let's plan"}
        <Arrow className="size-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </Link>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-stagger-2 data-card p-5">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground/60">
          <Icon className="size-4" />
        </div>
        <h2 className="font-display text-base font-bold text-foreground/85">{title}</h2>
      </div>
      <div className="text-sm leading-relaxed text-foreground/70">{children}</div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/30" />
      <span>{children}</span>
    </li>
  );
}

function ToolLi({
  href,
  label,
  desc,
  arrow: Arrow,
}: {
  href: string;
  label: string;
  desc: string;
  arrow: React.ComponentType<{ className?: string }>;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-2 rounded-lg border border-border/40 p-2.5 transition-colors hover:border-foreground/25 hover:bg-foreground/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground/85">{label}</span>
          <span className="block text-xs text-foreground/50">{desc}</span>
        </div>
        <Arrow className="size-3.5 shrink-0 text-foreground/30 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </Link>
    </li>
  );
}
