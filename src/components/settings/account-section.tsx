"use client";

import { useState } from "react";
import { LogOut, Loader2, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

        <p className="mt-2 text-sm text-foreground/50">{t("dangerZone")}</p>
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
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
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
