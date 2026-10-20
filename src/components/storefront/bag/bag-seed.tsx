import { cookies } from "next/headers";
import { db } from "@/db/client";
import { BAG_COOKIE, findBag, readBag } from "@/modules/bag/service";
import { EMPTY_BAG } from "@/modules/bag/types";
import { SeedBag } from "./bag-context";

/** Reads the visitor's bag on the server (inside Suspense: it depends on the cookie). */
export async function BagSeed({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  const bag = await findBag(db, (await cookies()).get(BAG_COOKIE)?.value);
  return <SeedBag bag={bag ? await readBag(db, bag.id) : EMPTY_BAG} />;
}
