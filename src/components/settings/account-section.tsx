"use client";

import { useState } from "react";
import { LogOut, Loader2, Trash2, KeyRound, Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";

// ---------------------------------------------------------------
// Account Section
// ---------------------------------------------------------------

export function AccountSection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const queryClient = useQueryClient();
  const profileQuery = api.user.getProfile.useQuery();

  const testEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
  const isTestUser = testEmail && profileQuery.data?.email === testEmail;

  const resetTestMutation = api.user.resetTestUser.useMutation({
    onSuccess: () => {
      queryClient.clear();
      toast.success(t("resetSuccess"));
      router.push("/dashboard");
      router.refresh();
    },
    onError: () => {
      toast.error(t("profileSaveError"));
    },
  });

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign-out failed:", e);
    } finally {
      queryClient.clear();
      router.replace("/");
    }
  };

  const handleResetTestData = () => {
    if (window.confirm(t("confirmResetTestData"))) {
      resetTestMutation.mutate();
    }
  };

  return (
    <SectionCard
      icon={LogOut}
      title={t("account")}
      description={t("accountDescription")}
      danger
    >
      <div className="flex flex-col gap-3">
        {/* #26 (12.7) — signing out is an everyday action, not an irreversible
            one; it lives ABOVE the danger label, in a neutral style. */}
        <Button variant="outline" onClick={handleSignOut} className="self-start">
          <LogOut className="size-4" />
          {t("signOut")}
        </Button>

        {/* Set / change password — this is where the "forgot password" recovery
            link lands (authenticated recovery session), so a student who reset
            can actually pick a new one; it also lets any email/password user
            change theirs (launch audit 24.7 — the flow used to dead-end here). */}
        <SetPasswordBlock />

        <p className="mt-2 text-sm text-foreground/60">{t("dangerZone")}</p>
        <div className="flex flex-wrap gap-2">
          {isTestUser && (
            <Button
              variant="destructive"
              onClick={handleResetTestData}
              disabled={resetTestMutation.isPending}
              className="self-start"
            >
              {resetTestMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("resetTestData")}
            </Button>
          )}
        </div>

        {/* SEC2 — permanent deletion (the privacy right). Type-to-confirm so a
            stray click can never erase a degree's worth of data. */}
        <DeleteAccountBlock onDone={handleSignOut} />
      </div>
    </SectionCard>
  );
}

function SetPasswordBlock() {
  const isHe = useLocale() === "he";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const canSave = pw.length >= 8 && pw === confirm && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success(isHe ? "הסיסמה עודכנה" : "Password updated");
      setPw("");
      setConfirm("");
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? (isHe ? "עדכון הסיסמה נכשל — נסו שוב." : "Couldn't update the password — try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-foreground/60" />
        <p className="text-sm font-semibold text-foreground/85">
          {isHe ? "סיסמה" : "Password"}
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? "כאן קובעים סיסמה חדשה — גם אם הגעתם מקישור ״שכחתי סיסמה״. לפחות 8 תווים."
          : "Set a new password here — including after a “forgot password” link. At least 8 characters."}
      </p>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={isHe ? "סיסמה חדשה" : "New password"}
          aria-label={isHe ? "סיסמה חדשה" : "New password"}
          autoComplete="new-password"
          className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-accent-brand focus:outline-none sm:w-44"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={isHe ? "אימות סיסמה" : "Confirm password"}
          aria-label={isHe ? "אימות סיסמה" : "Confirm password"}
          autoComplete="new-password"
          className={cn(
            "w-full rounded-md border bg-card px-3 py-1.5 text-sm focus:outline-none sm:w-44",
            mismatch ? "border-red-400/60 focus:border-red-400" : "border-border focus:border-accent-brand",
          )}
        />
        <Button onClick={handleSave} disabled={!canSave} className="self-start">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {isHe ? "עדכון" : "Update"}
        </Button>
      </div>
      {(tooShort || mismatch) && (
        <p className="mt-1.5 text-xs text-status-red">
          {tooShort
            ? (isHe ? "הסיסמה קצרה מדי (לפחות 8 תווים)." : "Too short (at least 8 characters).")
            : (isHe ? "הסיסמאות אינן תואמות." : "Passwords don't match.")}
        </p>
      )}
    </div>
  );
}

function DeleteAccountBlock({ onDone }: { onDone: () => void }) {
  const isHe = useLocale() === "he";
  const [confirmText, setConfirmText] = useState("");
  const CONFIRM = isHe ? "מחקו לצמיתות" : "DELETE FOREVER";
  const deleteMutation = api.user.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success(isHe ? "החשבון וכל הנתונים נמחקו" : "Account and all data deleted");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mt-2 rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
      <p className="text-sm font-semibold text-destructive">
        {isHe ? "מחיקת החשבון לצמיתות" : "Delete account permanently"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/60">
        {isHe
          ? "מוחק הכול: תוכנית, ציונים, משימות, שיחות עם היועץ, נתוני מילואים — וגם את התרומות האנונימיות שלכם לחוכמת-המחזור. אין דרך חזרה."
          : "Deletes everything: plan, grades, tasks, advisor chats, miluim data — and your anonymous cohort contributions. There is no way back."}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={isHe ? `הקלידו: ${CONFIRM}` : `Type: ${CONFIRM}`}
          aria-label={isHe ? "אישור מחיקת חשבון" : "Confirm account deletion"}
          className="w-48 rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-destructive/50 focus:outline-none"
        />
        <Button
          variant="destructive"
          disabled={confirmText.trim() !== CONFIRM || deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {isHe ? "מחקו את החשבון שלי" : "Delete my account"}
        </Button>
      </div>
    </div>
  );
}
