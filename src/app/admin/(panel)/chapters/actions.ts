"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { InvalidTransitionError } from "@/lib/state-machine";
import { parseChapterForm, saveChapter, setChapterCover, setChapterStatus } from "@/modules/catalog-admin/chapters";
import { formValues } from "@/modules/catalog-admin/input";
import { PieceRuleError } from "@/modules/catalog-admin/service";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { requireAdmin } from "@/modules/auth/auth";
import {
  CHAPTER_FOLDER,
  destroyPhoto,
  publicIdFromUrl,
  signUpload,
  verifyUpload,
  type SignedUpload,
  type UploadReceipt,
} from "@/modules/media/cloudinary";
import type { FormState, PhotoResult } from "../pieces/actions";

export async function saveChapterAction(chapterId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const parsed = parseChapterForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(form) };
  let id: string;
  try {
    id = await saveChapter(db, parsed.data, { chapterId: chapterId ?? undefined, actorId: user.id });
  } catch (err) {
    if (err instanceof PieceRuleError) return { errors: err.errors, values: formValues(form) };
    throw err;
  }
  updateTag(CATALOG_TAG);
  redirect(`/admin/chapters/${id}?${chapterId ? "saved" : "created"}=1`);
}

export async function setChapterStatusAction(chapterId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const to = z.enum(["draft", "published"]).safeParse(form.get("to"));
  if (!to.success) return { errors: { form: "Unknown change." } };
  try {
    await setChapterStatus(db, chapterId, to.data, user.id);
  } catch (err) {
    if (err instanceof PieceRuleError) return { errors: err.errors };
    if (err instanceof InvalidTransitionError) return { errors: { form: "This chapter can't make that change." } };
    throw err;
  }
  updateTag(CATALOG_TAG);
  return { errors: {}, savedAt: Date.now() };
}

export async function signChapterCoverUploadAction(chapterId: string): Promise<SignedUpload> {
  await requireAdmin();
  if (!z.uuid().safeParse(chapterId).success) throw new Error("Unknown chapter.");
  return signUpload(CHAPTER_FOLDER);
}

/** Sets the cover from a checked upload, or removes it (receipt null). The old file is deleted. */
export async function setChapterCoverAction(chapterId: string, receipt: UploadReceipt | null): Promise<PhotoResult> {
  const { user } = await requireAdmin();
  const photo = receipt ? verifyUpload(receipt, CHAPTER_FOLDER) : null;
  if (receipt && !photo) return { ok: false, error: "That upload couldn't be confirmed. Try again." };
  let previous: string | null;
  try {
    previous = await setChapterCover(db, chapterId, photo, user.id);
  } catch (err) {
    if (err instanceof PieceRuleError) return { ok: false, error: Object.values(err.errors)[0]! };
    throw err;
  }
  const oldId = previous ? publicIdFromUrl(previous) : null;
  if (oldId) after(() => destroyPhoto(oldId));
  updateTag(CATALOG_TAG);
  return { ok: true };
}
