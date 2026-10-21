import type { ReactNode } from "react";
import { cardClass } from "./ui";

/**
 * The admin's loading states, shaped like the page that's coming: a header,
 * then cards with soft bars where the words will be. Shown while a page's
 * data loads (each route's loading.tsx).
 */

function Bar({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block rounded ${className}`} />;
}

function Header({ action = false, back = false }: { action?: boolean; back?: boolean }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div className="space-y-3">
        {back ? <Bar className="h-4 w-20" /> : null}
        <Bar className="h-9 w-56 sm:w-72" />
        <Bar className="h-4 w-64 max-w-full sm:w-96" />
      </div>
      {action ? <Bar className="hidden h-11 w-36 rounded-full sm:block" /> : null}
    </div>
  );
}

function Box({ className = "", children }: { className?: string; children?: ReactNode }) {
  return <div className={`${cardClass} p-5 ${className}`}>{children}</div>;
}

function Rows({ n, thumb = false }: { n: number; thumb?: boolean }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          {thumb ? <Bar className="h-12 w-10 shrink-0 rounded-md" /> : null}
          <div className="flex-1 space-y-2">
            <Bar className="h-4 w-2/5" />
            <Bar className="h-3 w-1/4" />
          </div>
          <Bar className="h-4 w-16" />
          <Bar className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label}>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Loading label="Loading today">
      <Header action />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Box key={i} className="space-y-3">
            <Bar className="h-3 w-20" />
            <Bar className="h-8 w-10" />
            <Bar className="h-3 w-24" />
          </Box>
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Box key={i} className="space-y-3">
            <Bar className="h-3 w-20" />
            <Bar className="h-8 w-28" />
          </Box>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Box>
          <Bar className="mb-5 h-6 w-32" />
          <Rows n={5} />
        </Box>
        <Box>
          <Bar className="mb-5 h-6 w-28" />
          <Rows n={4} />
        </Box>
      </div>
    </Loading>
  );
}

export function ListSkeleton() {
  return (
    <Loading label="Loading orders">
      <Header />
      <Bar className="h-10 w-64 rounded-full" />
      <Box className="mt-6">
        <Rows n={6} />
      </Box>
    </Loading>
  );
}

export function OrderSkeleton() {
  return (
    <Loading label="Loading the order">
      <Header back />
      <Box className="mb-6 flex gap-6">
        {Array.from({ length: 5 }, (_, i) => (
          <Bar key={i} className="h-6 w-20 rounded-full" />
        ))}
      </Box>
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Box>
            <Bar className="mb-5 h-6 w-24" />
            <Rows n={2} />
            <Bar className="mt-5 h-24 w-full rounded-lg" />
          </Box>
          <div className="grid gap-6 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Box key={i} className="space-y-3">
                <Bar className="h-6 w-20" />
                <Bar className="h-4 w-3/4" />
                <Bar className="h-4 w-1/2" />
                <Bar className="h-4 w-2/3" />
              </Box>
            ))}
          </div>
        </div>
        <Box className="space-y-4">
          <Bar className="h-6 w-40" />
          <Bar className="h-4 w-full" />
          <Bar className="h-12 w-full rounded-full" />
          <Bar className="h-12 w-full rounded-full" />
        </Box>
      </div>
    </Loading>
  );
}

export function PiecesSkeleton() {
  return (
    <Loading label="Loading pieces">
      <Header action />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} className="flex gap-4 !p-3">
            <Bar className="aspect-[4/5] w-20 shrink-0 rounded-lg sm:w-24" />
            <div className="flex-1 space-y-2.5 py-1">
              <Bar className="h-3 w-10" />
              <Bar className="h-5 w-24" />
              <Bar className="h-3 w-32" />
              <Bar className="mt-4 h-5 w-20 rounded-full" />
            </div>
          </Box>
        ))}
      </div>
    </Loading>
  );
}

export function EditorSkeleton({ side = false }: { side?: boolean }) {
  return (
    <Loading label="Loading">
      <Header back />
      <div className={`grid gap-6 ${side ? "lg:grid-cols-[1fr_18rem]" : "max-w-3xl"}`}>
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <Box key={i} className="space-y-5">
              <Bar className="h-6 w-36" />
              <div className="grid gap-5 sm:grid-cols-2">
                <Bar className="h-12 w-full" />
                <Bar className="h-12 w-full" />
              </div>
              <Bar className="h-24 w-full" />
            </Box>
          ))}
        </div>
        {side ? (
          <Box className="h-fit space-y-4">
            <Bar className="h-6 w-20" />
            <Bar className="h-4 w-full" />
            <Bar className="h-12 w-full rounded-full" />
          </Box>
        ) : null}
      </div>
    </Loading>
  );
}
