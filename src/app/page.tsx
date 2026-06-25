import { redirect } from "next/navigation";

// Root page — redirects to default locale
// Middleware will then check auth and redirect to login if needed
export default function RootPage() {
  redirect("/he");
}
