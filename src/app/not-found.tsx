import Link from "next/link";

/**
 * Global 404 page — self-contained (renders outside the locale provider),
 * so it avoids next-intl hooks and styles itself with the app's design tokens.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-7xl font-bold text-foreground/15">404</p>
      <h1 className="text-2xl font-bold text-foreground">הדף לא נמצא</h1>
      <p className="max-w-sm text-foreground/60">
        הקישור שהגעתם אליו לא קיים או הוסר. אפשר לחזור ולהמשיך מהדף הראשי.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        חזרה לדף הבית
      </Link>
    </div>
  );
}
