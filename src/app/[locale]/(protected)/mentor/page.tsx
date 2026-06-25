import { setRequestLocale } from "next-intl/server";
import { MentorChat } from "@/components/mentor/mentor-chat";

export default async function MentorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MentorChat />;
}
