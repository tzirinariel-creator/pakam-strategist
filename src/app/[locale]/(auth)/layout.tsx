import { AppProviders } from "@/components/providers/app-providers";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <div className="bg-mesh flex min-h-screen items-center justify-center bg-background px-4">
        {children}
      </div>
    </AppProviders>
  );
}
