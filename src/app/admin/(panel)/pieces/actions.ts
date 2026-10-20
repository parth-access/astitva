"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { InvalidTransitionError } from "@/lib/state-machine";
import { formValues, parsePieceForm, type FieldErrors } from "@/modules/catalog-admin/input";
import { changePieceStock, PieceRuleError, savePiece, setPieceStatus } from "@/modules/catalog-admin/service";
import { CATALOG_TAG } from "@/modules/catalog/queries";
import { requireAdmin } from "@/modules/auth/auth";
import { InventoryError } from "@/modules/inventory/errors";

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
