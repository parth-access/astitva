"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { photoEditSchema } from "@/lib/photo-edit";
import { InvalidTransitionError } from "@/lib/state-machine";
import type { PanelPhoto } from "@/components/admin/photos-panel";
import { formValues, parsePieceForm, type FieldErrors } from "@/modules/catalog-admin/input";
import { addPhoto, movePhoto, removePhoto, setPhotoAlt, setPhotoColour, setPhotoEdit } from "@/modules/catalog-admin/photos";
import { PieceRuleError, savePiece, setPieceStatus } from "@/modules/catalog-admin/service";
import { setSpinVideo } from "@/modules/catalog-admin/spin";
import { notifyRestockedSoon } from "@/modules/alerts/soon";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { requireAdmin } from "@/modules/auth/auth";
import {
  destroyPhoto,
  PIECE_FOLDER,
  publicIdFromUrl,
  signUpload,
  SPIN_FOLDER,
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
  // New stock may be what someone asked to hear about.
  notifyRestockedSoon();
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

/* Photos ------------------------------------------------------------- */

/** A signature for one browser upload straight to Cloudinary. */
export async function signPhotoUploadAction(productId: string): Promise<SignedUpload> {
  await requireAdmin();
  if (!z.uuid().safeParse(productId).success) throw new Error("Unknown piece.");
  return signUpload(PIECE_FOLDER);
}

export type PhotoResult = { ok: true } | { ok: false; error: string };

/** Records an upload after checking Cloudinary's signed reply. Returns the new photo, so it can be edited straight away. */
export async function attachPhotoAction(
  productId: string,
  receipt: UploadReceipt,
  /** The colour it's a photo of; null for every colour. */
  colour: string | null = null,
): Promise<{ ok: true; photo: PanelPhoto } | { ok: false; error: string }> {
  const { user } = await requireAdmin();
  const photo = verifyUpload(receipt, PIECE_FOLDER);
  if (!photo) return { ok: false, error: "That upload couldn't be confirmed. Try again." };
  const c = z.string().max(48).nullable().safeParse(colour);
  if (!c.success) return { ok: false, error: "Unknown colour." };
  let row;
  try {
    row = await addPhoto(db, productId, photo, user.id, c.data);
  } catch (err) {
    if (err instanceof PieceRuleError) return { ok: false, error: Object.values(err.errors)[0]! };
    throw err;
  }
  updateTag(CATALOG_TAG);
  return { ok: true, photo: { id: row.id, url: row.url, originalUrl: null, edit: null, altText: row.altText, color: row.color } };
}

const photoChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("alt"), photoId: z.uuid(), altText: z.string() }),
  z.object({ kind: z.literal("move"), photoId: z.uuid(), direction: z.enum(["earlier", "later", "first"]) }),
  z.object({ kind: z.literal("remove"), photoId: z.uuid() }),
  z.object({ kind: z.literal("colour"), photoId: z.uuid(), colour: z.string().max(48).nullable() }),
  z.object({ kind: z.literal("edit"), photoId: z.uuid(), edit: photoEditSchema.nullable() }),
]);

export async function changePhotoAction(productId: string, change: z.infer<typeof photoChange>): Promise<PhotoResult> {
  const { user } = await requireAdmin();
  const c = photoChange.safeParse(change);
  if (!c.success) return { ok: false, error: "Unknown change." };
  try {
    if (c.data.kind === "alt") await setPhotoAlt(db, productId, c.data.photoId, c.data.altText);
    if (c.data.kind === "move") await movePhoto(db, productId, c.data.photoId, c.data.direction);
    if (c.data.kind === "colour") await setPhotoColour(db, productId, c.data.photoId, c.data.colour);
    if (c.data.kind === "edit") await setPhotoEdit(db, productId, c.data.photoId, c.data.edit, user.id);
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

/* Turning video (the 360° view) ------------------------------------- */

/** A signature for one browser video upload straight to Cloudinary. */
export async function signSpinUploadAction(productId: string): Promise<SignedUpload> {
  await requireAdmin();
  if (!z.uuid().safeParse(productId).success) throw new Error("Unknown piece.");
  return signUpload(SPIN_FOLDER);
}

/** Records an uploaded video after checking Cloudinary's signed reply, replacing (and deleting) any earlier one. */
export async function attachSpinAction(productId: string, receipt: UploadReceipt): Promise<PhotoResult> {
  const { user } = await requireAdmin();
  const video = verifyUpload(receipt, SPIN_FOLDER);
  if (!video) return { ok: false, error: "That upload couldn't be confirmed. Try again." };
  return changeSpin(productId, video.url, user.id);
}

export async function removeSpinAction(productId: string): Promise<PhotoResult> {
  const { user } = await requireAdmin();
  return changeSpin(productId, null, user.id);
}

async function changeSpin(productId: string, url: string | null, actorId: string): Promise<PhotoResult> {
  if (!z.uuid().safeParse(productId).success) return { ok: false, error: "Unknown piece." };
  let replaced: string | null;
  try {
    replaced = await setSpinVideo(db, productId, url, actorId);
  } catch (err) {
    if (err instanceof PieceRuleError) return { ok: false, error: Object.values(err.errors)[0]! };
    throw err;
  }
  const publicId = replaced ? publicIdFromUrl(replaced, undefined, "video") : null;
  if (publicId) after(() => destroyPhoto(publicId, undefined, "video"));
  updateTag(CATALOG_TAG);
  return { ok: true };
}
