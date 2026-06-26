"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GraduationCap, Loader2, AlertCircle, CheckCircle, Eye } from "lucide-react";

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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const ensureExists = api.user.ensureExists.useMutation();

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
      router.push("/planner");
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
          redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/planner`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (authError) {
        setError(authError.message);
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
            display_name: name,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // If user was created and session is available (email confirmation disabled)
      if (data.session) {
        // Sync user to Prisma DB
        await ensureExists.mutateAsync({
          email,
          displayName: name,
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
            <CheckCircle className="size-8 text-green-500" />
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
          </div>
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
      {/* Logo & Header */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/10 shadow-sm">
          <GraduationCap className="size-8 text-foreground/80" />
        </div>
        <div>
          <h1 className="font-display font-bold text-3xl tracking-tight">
            Pakamon
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("createAccount")}
          </p>
        </div>
      </div>

      {/* Signup Card */}
      <div data-card className="rounded-xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm space-y-4">
        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google OAuth — Primary */}
        <Button
          type="button"
          onClick={handleGoogleSignup}
          disabled={googleLoading}
          className="w-full gap-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-all h-12 text-base"
        >
          {googleLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <GoogleIcon className="size-5" />
              {t("loginWithGoogle")}
            </>
          )}
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
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            {t("signupWithEmail")}
          </button>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Name */}
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-muted-foreground">
                {t("name")}
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="bg-background/50"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                {t("email")}
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mail.tau.ac.il"
                required
                autoComplete="email"
                className="bg-background/50"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                minLength={6}
                autoComplete="new-password"
                className="bg-background/50"
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full bg-foreground text-primary-foreground hover:bg-foreground/90",
                "font-medium transition-all",
              )}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t("register")
              )}
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
            className="w-full gap-2 h-9 text-sm border-dashed border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all"
          >
            {demoLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Eye className="size-4" />
                {t("tryDemo")}
              </>
            )}
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
