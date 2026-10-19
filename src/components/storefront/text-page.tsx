import type { ReactNode } from "react";

export function TextPage({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-8">
      <div className="prose-astitva">
        <h1 className="text-4xl">{title}</h1>
        {intro && <div className="mt-6 text-lg text-espresso-soft">{intro}</div>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
