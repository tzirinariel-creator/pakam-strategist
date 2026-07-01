/**
 * Dashboard loading skeleton — mirrors the real layout (status hero + "my week"
 * zone) so the page keeps its shape while data loads, instead of a bare spinner
 * that discards it. Perceived-performance win (Project 1 step 5): the eye lands
 * where the content will be, not on a centered loader that then jumps.
 */
function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-foreground/10 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-hidden="true">
      {/* Status hero card */}
      <div className="data-card animate-pulse space-y-5 p-5 md:p-6">
        <div className="flex items-center gap-2">
          <Block className="size-5 rounded-full" />
          <Block className="h-5 w-28" />
          <Block className="ms-auto h-5 w-20 rounded-full" />
        </div>
        {/* Super-number */}
        <div className="flex items-baseline gap-3">
          <Block className="h-10 w-24" />
          <Block className="h-4 w-40" />
        </div>
        {/* Credit bar */}
        <Block className="h-3 w-full rounded-full" />
        {/* Discipline / bucket grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Block key={i} className="h-16" />
          ))}
        </div>
        <Block className="h-9 w-44 rounded-lg" />
      </div>

      {/* "My week" zone */}
      <div className="space-y-3">
        <Block className="h-6 w-32 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Block className="h-40 animate-pulse" />
          <Block className="h-40 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
