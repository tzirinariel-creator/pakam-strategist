"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authErrorKey } from "@/lib/auth-helpers";
import { Loader2, AlertCircle, CheckCircle, Eye, Mail } from "lucide-react";
import { AuthHeader } from "@/components/auth/auth-header";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SignupForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const ensureExists = api.user.ensureExists.useMutation();

  // Tick down the resend cooldown once a second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendMessage(null);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/dashboard`,
        },
      });
      if (resendError) {
        setResendMessage(t("resendError"));
        return;
      }
      setResendMessage(t("resendSuccess"));
      setResendCooldown(60);
    } catch {
      setResendMessage(t("resendError"));
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      const res = await fetch("/api/auth/demo-login", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Demo login failed" }));
        setError(data.error ?? t("unexpectedError"));
        return;
      }
      // Land on the dashboard AND reset the demo account (was /planner without
      // reset — inconsistent with login; recruiters saw stale leftovers). (#8)
      router.push("/dashboard?reset=demo");
      router.refresh();
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setDemoLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/dashboard`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (authError) {
        const key = authErrorKey(authError.message);
        setError(key ? t(key) : t("unexpectedError"));
        setGoogleLoading(false);
      }
      // If no error, the browser will redirect to Google
    } catch {
      setError(t("unexpectedError"));
      setGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: "",
          },
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/dashboard`,
        },
      });

      if (authError) {
        const key = authErrorKey(authError.message);
        setError(key ? t(key) : t("unexpectedError"));
        return;
      }

      // If user was created and session is available (email confirmation disabled)
      if (data.session) {
        // Sync user to Prisma DB
        await ensureExists.mutateAsync({
          email,
          displayName: "",
        });

        router.push("/dashboard");
        router.refresh();
      } else {
        // Email confirmation is required
        setConfirmationSent(true);
      }
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  // Confirmation email sent state
  if (confirmationSent) {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-green-500/10">
            <CheckCircle className="size-8 text-status-green" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight">
              {t("checkYourEmail")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.rich("confirmationSent", {
                email,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            {/* Spam-folder hint */}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("spamHint")}
            </p>
          </div>

          {/* Resend feedback */}
          {resendMessage && (
            <p aria-live="polite" className="text-xs font-medium text-foreground/70">
              {resendMessage}
            </p>
          )}

          {/* Resend button with cooldown */}
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="w-full gap-2"
          >
            <Mail className="size-4" />
            {resendCooldown > 0
              ? t("resendCooldown", { seconds: resendCooldown })
              : t("resendEmail")}
          </Button>

          {/* Wrong email? → go back to edit the form */}
          <button
            type="button"
            onClick={() => {
              setConfirmationSent(false);
              setResendMessage(null);
              setResendCooldown(0);
            }}
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("wrongEmail")}
          </button>

          <Link
            href="/login"
            className="text-sm font-medium text-foreground/80 underline-offset-4 hover:underline"
          >
            {t("login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Header — shared identity chip (King grammar), warm line (#13).
          The same three benefit lines as the login (#6): signup is the
          conversion moment — it deserves the pitch at least as much. */}
      <AuthHeader
        subtitle={t("createAccount")}
        warmLine={t("signupWarmLine")}
        benefits={[t("loginBenefit1"), t("loginBenefit2"), t("loginBenefit3")]}
      />

      {/* Signup Card */}
      <div data-card className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm space-y-4">
        {/* Error Message */}
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google OAuth — Primary */}
        <Button
          type="button"
          onClick={handleGoogleSignup}
          disabled={googleLoading}
          /* #10 — this was raw Tailwind greys (bg-white / gray-800 / gray-300),
             a palette the app does not own: `gray-800` (#1F2937) is BLUE-tinted
             next to our neutral #16161C card, and `gray-600` borders are 4× the
             weight of ours. It is also the single biggest block of colour on the
             screen — which is exactly why the signup read as "קשוח ואפור".
             Surface tokens instead: it now sits on the app's own card, in both
             themes, and Google's mark stays the only colour in it. */
          className="w-full gap-3 h-12 text-base font-medium bg-card text-foreground border border-border hover:bg-card-hover"
        >
          {/* See login-form: a childless lucide icon is aria-hidden, so a
              button whose only content is the spinner has NO accessible name
              while it is working. Swap the glyph, keep the label. */}
          {googleLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <GoogleIcon className="size-5" />
          )}
          {t("loginWithGoogle")}
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card/50 px-3 text-muted-foreground backdrop-blur-sm">
              {t("or")}
            </span>
          </div>
        </div>

        {/* Email/Password — Secondary (collapsible) */}
        {!showEmailForm ? (
          /* #10 — was bare grey centred text. On a screen whose only other
             element is a neutral button, "grey text pretending to be a button"
             is most of why it felt cold. It is a real affordance, so it looks
             like one — the same outline Button the rest of the app uses. */
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowEmailForm(true)}
            className="w-full h-11"
          >
            {t("signupWithEmail")}
          </Button>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* No name field here (#13): signup stays email+password only. The
                name is asked warmly a minute later in onboarding (with gender,
                in context) — one place for it, not two. */}
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                {t("email")}
              </label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="h-11 bg-background/50"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                {t("password")}
              </label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                minLength={6}
                autoComplete="new-password"
                className="h-11 bg-background/50"
              />
            </div>

            {/* Submit — the primary CTA is indigo. It used to say so by hand,
                because <Button>'s default was near-black ink; #32 moved that
                rule into the component, so the override is gone and this button
                and every other primary action share ONE source of truth. */}
            <Button type="submit" disabled={loading} className="w-full h-11 font-medium">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("createAccount")}
            </Button>
          </form>
        )}

        {/* Demo Mode — Try without signing up (bottom, less prominent) */}
        {process.env.NEXT_PUBLIC_SHOW_DEMO === "true" && (
          <Button
            type="button"
            onClick={handleDemoLogin}
            disabled={demoLoading}
            variant="outline"
            className="w-full gap-2 h-11 text-sm border-dashed border-border text-foreground/70 hover:bg-foreground/5 hover:text-foreground/80 transition-all"
          >
            {demoLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Eye className="size-4" />
            )}
            {t("tryDemo")}
          </Button>
        )}
      </div>

      {/* Footer Links */}
      <div className="text-center text-sm text-muted-foreground">
        <span>{t("hasAccount")}</span>{" "}
        <Link
          href="/login"
          className="font-medium text-foreground/80 underline-offset-4 hover:underline"
        >
          {t("login")}
        </Link>
      </div>
    </div>
  );
}
