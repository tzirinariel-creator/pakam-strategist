// TEMPORARY QA-ONLY PAGE — DELETE BEFORE COMMITTING.
// Renders the onboarding wizard directly so the flow can be walked in a local
// browser without depending on the dashboard's plan-state gate.
import { setRequestLocale } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default async function QaOnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OnboardingWizard />;
}
