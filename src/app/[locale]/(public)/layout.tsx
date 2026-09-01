"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/lib/constants";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("landing");

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/" className="flex items-center gap-2">
            <GraduationCap className="size-6 text-foreground/80" />
            <span className="font-bold text-lg text-foreground/80">
              {t("brand")}
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button
              size="sm"
              asChild
            >
              <Link href="/signup">{t("signup")}</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 px-6 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="size-4 text-foreground/60" />
            <span>{t("footer")}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link
              href="/about"
              className="transition-colors hover:text-foreground"
            >
              {t("footerAbout")}
            </Link>
            <Link
              href="/faq"
              className="transition-colors hover:text-foreground"
            >
              {t("footerFaq")}
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              {t("footerPrivacy")}
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              {t("footerTerms")}
            </Link>
            <Link
              href="/accessibility"
              className="transition-colors hover:text-foreground"
            >
              {t("footerAccessibility")}
            </Link>
            {/* L3 — feedback channel for logged-out visitors too.
                Shows the ADDRESS rather than the words "report a problem": a
                bare mailto: does nothing at all on a machine with no mail
                client bound to the protocol, and a link whose only failure mode
                is silence is indistinguishable from a broken one. With the
                address as the text, a dead click still hands the visitor
                something they can use. */}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=%D7%9E%D7%A9%D7%95%D7%91%20%D7%A2%D7%9C%20%D7%A4%D7%9B%D7%9E%D7%95%D7%9F`}
              className="font-data transition-colors hover:text-foreground"
              dir="ltr"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
