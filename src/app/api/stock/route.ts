import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getPieceAvailability } from "@/modules/inventory/service";

const id = z.uuid();

/** Live stock for one piece, by variant. Never cached; the buy panel asks after the page has loaded. */
export async function GET(request: Request) {
  await connection();
  const piece = id.safeParse(new URL(request.url).searchParams.get("piece"));
  if (!piece.success) return Response.json({ error: "No such piece" }, { status: 400 });
  return Response.json(await getPieceAvailability(db, piece.data), { headers: { "cache-control": "no-store" } });
}
