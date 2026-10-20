"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { InvalidTransitionError } from "@/lib/state-machine";
import { formValues, parsePieceForm, type FieldErrors } from "@/modules/catalog-admin/input";
import { addPhoto, movePhoto, removePhoto, setPhotoAlt } from "@/modules/catalog-admin/photos";
import { changePieceStock, PieceRuleError, savePiece, setPieceStatus } from "@/modules/catalog-admin/service";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { requireAdmin } from "@/modules/auth/auth";
import { InventoryError } from "@/modules/inventory/errors";
import {
  destroyPhoto,
  PIECE_FOLDER,
  publicIdFromUrl,
  signUpload,
  verifyUpload,
  type SignedUpload,
  type UploadReceipt,
} from "@/modules/media/cloudinary";

export type FormState = {
  errors: FieldErrors;
  /** What was typed, so the form shows it again after a failed save. */
  values?: Record<string, string>;
  /** Set after a successful save, to show a short confirmation. */
  savedAt?: number;
};

export async function savePieceAction(productId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const parsed = parsePieceForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(form) };

  let id: string;
  try {
    id = await savePiece(db, parsed.data, { productId: productId ?? undefined, actorId: user.id });
  } catch (err) {
    if (err instanceof PieceRuleError) return { errors: err.errors, values: formValues(form) };
    throw err;
  }
  updateTag(CATALOG_TAG);
  // Reload the piece so new sizes get their ids (a second save must not add them again).
  redirect(`/admin/pieces/${id}?${productId ? "saved" : "created"}=1`);
}

const statusSchema = z.enum(["active", "archived"]);

export async function setPieceStatusAction(productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const to = statusSchema.safeParse(form.get("to"));
  if (!to.success) return { errors: { form: "Unknown change." } };
  try {
    await setPieceStatus(db, productId, to.data, user.id);
  } catch (err) {
    if (err instanceof PieceRuleError) return { errors: err.errors };
    if (err instanceof InvalidTransitionError) return { errors: { form: "This piece can't make that change." } };
    throw err;
  }
  updateTag(CATALOG_TAG);
  return { errors: {}, savedAt: Date.now() };
}

const stockSchema = z.object({
  variantId: z.uuid(),
  kind: z.enum(["receipt", "adjustment_up", "adjustment_down", "damage"]),
  quantity: z.coerce.number().int("Whole pieces only.").min(1, "At least 1.").max(999),
  reason: z.string().trim().min(3, "Say why, in a few words.").max(200),
});

export async function changeStockAction(productId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const parsed = stockSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { errors, values: formValues(form) };
  }
  const { variantId, kind, quantity, reason } = parsed.data;
  const delta = kind === "receipt" || kind === "adjustment_up" ? quantity : -quantity;
  const type = kind === "adjustment_up" || kind === "adjustment_down" ? "adjustment" : kind;
  try {
    await changePieceStock(db, productId, { variantId, delta, type, reason }, user.id);
  } catch (err) {
    if (err instanceof PieceRuleError) return { errors: err.errors, values: formValues(form) };
    if (err instanceof InventoryError) {
      return {
        errors: {
          quantity:
            err.code === "insufficient_stock"
              ? "There aren't that many in stock that aren't already in someone's bag."
              : err.message,
        },
        values: formValues(form),
      };
    }
    throw err;
  }
  updateTag(CATALOG_TAG);
  return { errors: {}, savedAt: Date.now() };
}

/* Photos ------------------------------------------------------------- */

/** A signature for one browser upload straight to Cloudinary. */
export async function signPhotoUploadAction(productId: string): Promise<SignedUpload> {
  await requireAdmin();
  if (!z.uuid().safeParse(productId).success) throw new Error("Unknown piece.");
  return signUpload(PIECE_FOLDER);
}

export type PhotoResult = { ok: true } | { ok: false; error: string };

/** Records an upload after checking Cloudinary's signed reply. */
export async function attachPhotoAction(productId: string, receipt: UploadReceipt): Promise<PhotoResult> {
  const { user } = await requireAdmin();
  const photo = verifyUpload(receipt, PIECE_FOLDER);
  if (!photo) return { ok: false, error: "That upload couldn't be confirmed. Try again." };
  try {
    await addPhoto(db, productId, photo, user.id);
  } catch (err) {
    if (err instanceof PieceRuleError) return { ok: false, error: Object.values(err.errors)[0]! };
    throw err;
  }
  updateTag(CATALOG_TAG);
  return { ok: true };
}

const photoChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("alt"), photoId: z.uuid(), altText: z.string() }),
  z.object({ kind: z.literal("move"), photoId: z.uuid(), direction: z.enum(["earlier", "later", "first"]) }),
  z.object({ kind: z.literal("remove"), photoId: z.uuid() }),
]);

export async function changePhotoAction(productId: string, change: z.infer<typeof photoChange>): Promise<PhotoResult> {
  const { user } = await requireAdmin();
  const c = photoChange.safeParse(change);
  if (!c.success) return { ok: false, error: "Unknown change." };
  try {
    if (c.data.kind === "alt") await setPhotoAlt(db, productId, c.data.photoId, c.data.altText);
    if (c.data.kind === "move") await movePhoto(db, productId, c.data.photoId, c.data.direction);
    if (c.data.kind === "remove") {
      const url = await removePhoto(db, productId, c.data.photoId, user.id);
      const publicId = publicIdFromUrl(url);
      if (publicId) after(() => destroyPhoto(publicId));
    }
  } catch (err) {
    if (err instanceof PieceRuleError) return { ok: false, error: Object.values(err.errors)[0]! };
    throw err;
  }
  updateTag(CATALOG_TAG);
  return { ok: true };
}
