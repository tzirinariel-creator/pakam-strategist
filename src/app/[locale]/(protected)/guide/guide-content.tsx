"use client";

import {
  GraduationCap,
  Layers,
  Compass,
  LayoutGrid,
  Shield,
  Gavel,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bidi } from "@/lib/bidi";

/**
 * "פכמיסט מתחיל" — a friendly, accurate orientation page. Explains what the
 * degree is, how it's built, how to plan it, and which tool in the app does
 * what. Facts mirror the domain rules; numbers wrapped in <Bidi> for clean RTL.
 */
export function GuideContent() {
  const isHe = useLocale() === "he";
  const Arrow = isHe ? ArrowLeft : ArrowRight;

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

      <Section icon={Compass} title={isHe ? "מה זה פכ\"מ?" : "What is PPE?"}>
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
            ? "לומדים ב-3 פקולטות שונות, כל אחת עם מזכירות וחוקים משלה. תחום ההתמחות שתבחר קובע גם את הסיווג שלך בשירות המדינה."
            : "You study across 3 faculties, each with its own rules. Your focus area even sets your civil-service track."}
        </p>
      </Section>

      <Section icon={Layers} title={isHe ? "איך התואר בנוי" : "How the degree is built"}>
        <ul className="space-y-1.5">
          <Li><Bidi text={isHe ? "103 ש״ס חובה" : "103 mandatory credits"} /> {isHe ? "— הליבה של התואר." : "— the core."}</Li>
          <Li><Bidi text={isHe ? "12 ש״ס סמינרים" : "12 seminar credits"} /> {isHe ? "(3 עבודות + רפרט)." : "(3 papers + a referat)."}</Li>
          <Li><Bidi text={isHe ? "35 ש״ס בחירה" : "35 elective credits"} />.</Li>
          <Li>{isHe ? "התמחות: " : "Focus area: "}<Bidi text={isHe ? "60 ש״ס" : "60 credits"} /> {isHe ? "בתחום אחד (פילוסופיה / כלכלה / מדע המדינה)." : "in one discipline."}</Li>
          <Li>{isHe ? "2 קורסי אנגלית (תוכן), ולפי ציון האמירנט — אולי קורסי-רמה." : "2 English content courses; level courses depend on your Amiram score."}</Li>
          <Li>{isHe ? "ציון גמר = " : "Final grade = "}<Bidi text={isHe ? "78% קורסים + 18% סמינרים + 4% רפרט" : "78% courses + 18% seminars + 4% referat"} />.</Li>
        </ul>
      </Section>

      <Section icon={Sparkles} title={isHe ? "איך לתכנן חכם" : "How to plan smartly"}>
        <ul className="space-y-1.5">
          <Li>{isHe ? "שנה א׳ = קורסי חובה. אל תתחכם — קח הכל ותתמקד בממוצע טוב." : "Year 1 = mandatory courses. Take them all, aim for a good GPA."}</Li>
          <Li>{isHe ? "בחר תחום התמחות מוקדם — הוא משפיע על כל התכנון." : "Choose your focus area early — it drives the whole plan."}</Li>
          <Li>{isHe ? "קח אנגלית מוקדם — ש״ס קלות שמשחררות לחץ אחר כך." : "Take English early — easy credits that relieve pressure later."}</Li>
          <Li>{isHe ? "אל תשים 3 קורסים כבדים באותו סמסטר." : "Don't stack 3 heavy courses in one semester."}</Li>
          <Li>{isHe ? "מעבר שנה: " : "Year transition: "}<Bidi text={isHe ? "ממוצע 75 כללי + 80 בקורסי פכ\"מ" : "75 overall + 80 in PPE courses"} />.</Li>
        </ul>
      </Section>

      <Section icon={LayoutGrid} title={isHe ? "הכלים שלך כאן" : "Your tools here"}>
        <ul className="space-y-1.5">
          <ToolLi href="/dashboard" label={isHe ? "דשבורד — \"המצב שלי\"" : "Dashboard — \"My status\""} desc={isHe ? "מבט-על: כמה נשאר, באיזה תחום, מה חסר." : "Bird's-eye: what's left, by category."} arrow={Arrow} />
          <ToolLi href="/planner" label={isHe ? "מתכנן התואר" : "Degree planner"} desc={isHe ? "גרור קורסים בין סמסטרים, סמן הושלמו." : "Drag courses across semesters."} arrow={Arrow} />
          <ToolLi href="/exam-planner" label={isHe ? "תכנון מבחנים" : "Exam planner"} desc={isHe ? "תוכנית-לימוד חכמה אחורה מכל מבחן." : "A smart reverse-planned study schedule."} arrow={Arrow} />
          <ToolLi href="/regulations" label={isHe ? "תקנון" : "Regulations"} desc={isHe ? "הסטטוס שלך מול כל דרישות התואר." : "Your status against every requirement."} arrow={Arrow} />
          <ToolLi href="/mentor" label={isHe ? "עוזר התואר" : "Degree assistant"} desc={isHe ? "שאל כל שאלה — תשובות מהנתונים שלך." : "Ask anything — answered from your data."} arrow={Arrow} />
        </ul>
      </Section>

      <Section icon={Shield} title={isHe ? "מילואים" : "Reserve duty (Miluim)"}>
        <p>
          {isHe
            ? "אם שירתת — עדכן בהגדרות. תקבל פטור ש\"ס, אפשרות לסמן קורסים כ\"בינארי\" (עובר/לא־עובר, יוצא מהממוצע), בחירת מועדים ועוד. פס המילואים למעלה מראה לך תמיד מה מגיע לך."
            : "If you served, set it in settings. You'll get credit exemptions, the option to mark courses binary (pass/fail, excluded from the average), exam-date choice, and more. The miluim bar up top always shows your benefits."}
        </p>
      </Section>

      <Section icon={Gavel} title={isHe ? "בידינג (מכרז)" : "Bidding"}>
        <p>
          {isHe
            ? "רישום לקורסים הוא מכרז: המציע הגבוה זוכה (לא כל-הקודם-זוכה). המלכודת הגדולה — רישום לקורס שחופף בזמן מבטל את הקודם. יש מסביר מלא במתכנן."
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
