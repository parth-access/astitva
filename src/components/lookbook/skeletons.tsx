/**
 * Loading states shaped like the real pages: paper-coloured arches and soft
 * bars where text will be, with a slow shimmer (none under reduced motion).
 * Shown only while data streams in; cached pages rarely need them.
 */

function Bar({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block rounded-[2px] ${className}`} />;
}

export function ArchSkeleton({ ratio = "4/5" }: { ratio?: string }) {
  return <span aria-hidden="true" className="skeleton arch block w-full" style={{ aspectRatio: ratio }} />;
}

export function LookbookSkeleton() {
  return (
    <div className="lookbook" role="status" aria-label="Loading the lookbook">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 pb-16 pt-10 md:min-h-[calc(100svh-7rem)] md:grid-cols-2 md:px-12 md:pt-14">
        <div className="flex items-end justify-center md:order-2">
          <div className="w-full max-w-[30rem]">
            <ArchSkeleton ratio="3/4" />
          </div>
        </div>
        <div className="flex flex-col justify-center gap-5 md:order-1">
          <Bar className="h-6 w-40" />
          <Bar className="h-24 w-[80%] md:h-40" />
          <Bar className="h-5 w-72 max-w-full" />
          <Bar className="h-5 w-56 max-w-full" />
        </div>
      </div>
    </div>
  );
}

export function PieceSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-28 pt-6 sm:px-8 md:grid-cols-12 md:gap-8 md:pt-10" role="status" aria-label="Loading the piece">
      <div className="mx-auto w-[84%] md:col-span-7 md:w-full">
        <ArchSkeleton />
      </div>
      <div className="flex flex-col gap-5 md:col-span-4 md:col-start-9">
        <Bar className="h-5 w-32" />
        <Bar className="h-16 w-3/4" />
        <Bar className="h-5 w-24" />
        <div className="mt-4 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} aria-hidden="true" className="skeleton size-8 rounded-full" />
          ))}
        </div>
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-11 w-14" />
          ))}
        </div>
        <Bar className="mt-4 h-12 w-full" />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-14 sm:gap-x-8 lg:grid-cols-3 lg:gap-x-12" role="status" aria-label="Loading pieces">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="space-y-4">
          <ArchSkeleton />
          <Bar className="h-5 w-2/3" />
          <Bar className="h-4 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
