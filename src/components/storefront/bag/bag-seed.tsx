import { db } from "@/db/client";
import { currentBag } from "@/modules/bag/current";
import { readBag } from "@/modules/bag/service";
import { EMPTY_BAG } from "@/modules/bag/types";
import { SeedBag } from "./bag-context";

/** Reads the visitor's bag on the server (inside Suspense: it depends on the cookie and the account). */
export async function BagSeed({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  const bag = await currentBag();
  return <SeedBag bag={bag ? await readBag(db, bag.id) : EMPTY_BAG} />;
}
