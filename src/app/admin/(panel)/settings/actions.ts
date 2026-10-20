"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { formValues } from "@/modules/catalog-admin/input";
import { parseSettingsForm, saveSettings } from "@/modules/catalog-admin/settings";
import { CATALOG_TAG, SETTINGS_TAG } from "@/modules/catalog/queries";
import { requireAdmin } from "@/modules/auth/auth";
import type { FormState } from "../pieces/actions";

/** Owners only: these change what every visitor sees and whether they can buy. */
export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireAdmin({ roles: ["owner"] });
  const parsed = parseSettingsForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(form) };
  await saveSettings(db, parsed.data, user.id);
  updateTag(SETTINGS_TAG);
  updateTag(CATALOG_TAG);
  redirect("/admin/settings?saved=1");
}
