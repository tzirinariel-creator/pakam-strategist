import { setRequestLocale } from "next-intl/server";
import { MentorsContent } from "@/components/mentor-links/mentors-content";

export default async function MentorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MentorsContent />;
}
