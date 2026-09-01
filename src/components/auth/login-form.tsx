"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authErrorKey } from "@/lib/auth-helpers";
import { Loader2, AlertCircle, Eye } from "lucide-react";
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

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // The callback now says WHICH way it failed (#3). Each one gets the sentence
  // that is actually true, because "בדקו את הפרטים" is wrong advice for three
  // of these four — the student never typed any details.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("error");
    if (!reason) return;
    const isHe = locale === "he";
    const message =
      reason === "cancelled"
        ? null // Backing out of Google's consent screen is a choice, not a fault.
        : reason === "provider"
          ? isHe
            ? "Google לא השלים את ההתחברות. אפשר לנסות שוב, או להתחבר עם אימייל וסיסמה."
            : "Google didn't complete the sign-in. Try again, or use email and password."
          : reason === "exchange"
            ? isHe
              ? "ההתחברות אושרה אבל לא הצלחנו לפתוח את החיבור. נסו שוב — ואם זה חוזר, כתבו לי ואטפל."
              : "You were approved but we couldn't open the session. Try again — if it repeats, write to me."
            : t("loginFailed");
    if (message) setError(message);
    window.history.replaceState({}, "", window.location.pathname);
  }, [t, locale]);

  const handleGoogleLogin = async () => {
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
    setResetMessage(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        const key = authErrorKey(authError.message);
        setError(key ? t(key) : t("loginFailed"));
        return;
      }

      // Redirect to dashboard after successful login
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  // Send a password reset link. The callback route handles the recovery token,
  // so the user lands authenticated and can set a new password from Settings.
  const handleForgotPassword = async () => {
    setError(null);
    setResetMessage(null);
    if (!email) {
      // Empty-email reset is NOT a login failure — say exactly what to do
      // instead of the misleading "משהו השתבש בהתחברות" (audit 22.7).
      setResetMessage(
        locale === "he"
          ? "הזינו קודם כתובת אימייל, ואז נשלח לכם קישור לאיפוס."
          : "Enter your email address first, then we'll send a reset link.",
      );
      return;
    }
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/settings`,
        },
      );
      if (resetError) {
        setResetMessage(t("resetEmailError"));
        return;
      }
      // Neutral message regardless of whether the address exists (avoids enumeration).
      setResetMessage(t("resetEmailSent"));
    } catch {
      setResetMessage(t("resetEmailError"));
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
      // Land on the dashboard (the "המצב שלי" wow screen) AND trigger the demo
      // reset — ?reset=demo is what makes resetDemoUser fire, so every demo
      // visitor gets a fresh, full plan instead of the previous stranger's
      // leftovers (board finding: the reset was dead code without this).
      router.push("/dashboard?reset=demo");
      router.refresh();
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setDemoLoading(false);
    }
  };


  return (
    <div className="w-full max-w-md space-y-8">
      {/* Header — shared identity chip (King grammar). Q6 (note 6): one value
          line + three short benefits, so a first-time visitor knows what this
          is before being asked to sign in. */}
      <AuthHeader
        subtitle={t("login")}
        warmLine={t("loginValueLine")}
        benefits={[t("loginBenefit1"), t("loginBenefit2"), t("loginBenefit3")]}
      />

      {/* Login Card */}
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
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          /* #10 — same fix as the signup form: surface tokens, not raw greys.
             The two auth screens must not drift apart. */
          className="w-full gap-3 h-12 text-base font-medium bg-card text-foreground border border-border hover:bg-card-hover"
        >
          {/* The label must survive the spinner. lucide adds aria-hidden="true"
              to a childless icon, so a button whose ONLY content is <Loader2 />
              computes an EMPTY accessible name: a screen reader announces
              "button", with no hint that anything is happening. Swap the glyph,
              keep the words. */}
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
          /* The signup screen fixed this and the login screen did not — the
             same drift the comment above warns about. Grey text pretending to
             be a button, ~36px tall, below the 44px minimum. Same outline
             Button the rest of the app uses. */
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowEmailForm(true)}
            className="w-full h-11"
          >
            {t("loginWithEmail")}
          </Button>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                autoComplete="current-password"
                className="h-11 bg-background/50"
              />
            </div>

            {/* Forgot password — sends a reset link; falls back to Google guidance */}
            <div className="flex flex-col gap-1 text-start">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgotPassword")}
              </button>
              <span className="text-[11px] text-muted-foreground/70">
                {t("forgotPasswordHint")}
              </span>
            </div>

            {/* Reset feedback */}
            {resetMessage && (
              <p aria-live="polite" className="text-xs font-medium text-foreground/70">
                {resetMessage}
              </p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full bg-accent-brand text-accent-brand-fg hover:bg-accent-brand-hover",
                "font-medium transition-all",
              )}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("login")}
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
            className="w-full gap-2 h-11 text-sm border-dashed border-border text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80 transition-all"
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
        <span>{t("noAccount")}</span>{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground/80 underline-offset-4 hover:underline"
        >
          {t("createAccount")}
        </Link>
      </div>

    </div>
  );
}
