import { cache, Suspense } from "react";
import { BottomTabs, Sidebar, TopBar, type NavState } from "@/components/admin/shell";
import { db } from "@/db/client";
import { requireAdmin } from "@/modules/auth/auth";
import { countOrdersToCheck } from "@/modules/orders/service";

/** Shown at once, before we know who's signed in: every section but the badge. */
const BEFORE: NavState = { owner: true, toCheck: 0, name: null };

/** Read once per request, for both the sidebar and the tabs. */
const navState = cache(async (): Promise<NavState> => {
  const { user, role } = await requireAdmin();
  return { owner: role === "owner", toCheck: await countOrdersToCheck(db), name: user.name };
});

async function LiveSidebar() {
  return <Sidebar state={await navState()} />;
}
async function LiveTabs() {
  return <BottomTabs state={await navState()} />;
}

/**
 * Everything inside the admin proper. The frame draws straight away; who's
 * signed in, the badge and each page stream in. Pages and server actions
 * still call requireAdmin() themselves.
 */
export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 bg-ivory">
      <Suspense fallback={<Sidebar state={BEFORE} />}>
        <LiveSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-8 lg:pb-16 lg:pt-10">
          {children}
        </main>
      </div>
      <Suspense fallback={<BottomTabs state={BEFORE} />}>
        <LiveTabs />
      </Suspense>
    </div>
  );
}
