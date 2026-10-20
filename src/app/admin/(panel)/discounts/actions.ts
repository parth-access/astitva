"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { rupeesToPaise } from "@/lib/money";
import { requireAdmin } from "@/modules/auth/auth";
import { createCode, DiscountError, normaliseCode, setCodeActive } from "@/modules/discounts/service";

export type DiscountFormState = { errors: Record<string, string>; values?: Record<string, string>; created?: string };

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
/** A date typed in the admin is India time; stored as an instant. */
const istDate = (endOfDay: boolean) =>
  z.preprocess(
    blank,
    z.iso
      .date("Pick a date.")
      .transform((d) => new Date(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`))
      .nullable(),
  );
const rupees = (label: string) =>
  z.string().transform((v, ctx) => {
    try {
      return rupeesToPaise(v.replace(/[,₹\s]/g, "") || "0");
    } catch {
      ctx.addIssue({ code: "custom", message: `${label}: enter rupees, like 500.` });
      return z.NEVER;
    }
  });

const schema = z
  .object({
    code: z.string().transform((v, ctx) => {
      const c = normaliseCode(v);
      if (!c) ctx.addIssue({ code: "custom", message: "3–32 letters, numbers or dashes, like LAUNCH10." });
      return c ?? "";
    }),
    kind: z.enum(["percent", "amount"]),
    value: z.string().trim().min(1, "How much off?"),
    minSubtotal: rupees("Minimum"),
    startsAt: istDate(false),
    endsAt: istDate(true),
    maxUses: z.preprocess(blank, z.coerce.number({ message: "A number." }).int("Whole uses.").positive("At least 1.").max(100_000).nullable()),
    onePerPhone: z.boolean(),
    note: z.preprocess(blank, z.string().trim().max(200).nullable()),
  })
  .transform((d, ctx) => {
    let value = 0;
    if (d.kind === "percent") {
      const pct = Number(d.value.replace("%", ""));
      if (!Number.isFinite(pct) || pct <= 0 || pct > 90) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage from 1 to 90." });
      else value = Math.round(pct * 100);
    } else {
      try {
        value = rupeesToPaise(d.value.replace(/[,₹\s]/g, ""));
        if (value <= 0) throw new Error();
      } catch {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Rupees off, like 500." });
      }
    }
    if (d.startsAt && d.endsAt && d.startsAt >= d.endsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Ends after it starts." });
    return { ...d, value };
  });

/** Owners only: codes change what money comes in. */
export async function createDiscountAction(_prev: DiscountFormState, form: FormData): Promise<DiscountFormState> {
  const { user } = await requireAdmin({ roles: ["owner"] });
  const values = Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string"));
  const parsed = schema.safeParse({ ...values, onePerPhone: values.onePerPhone === "on" });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[i.path.join(".") || "form"] ??= i.message;
    return { errors, values };
  }
  const d = parsed.data;
  try {
    await createCode(
      db,
      {
        code: d.code,
        kind: d.kind,
        value: d.value,
        minSubtotalMinor: d.minSubtotal,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        maxUses: d.maxUses,
        onePerPhone: d.onePerPhone,
        note: d.note,
      },
      user.id,
    );
  } catch (err) {
    if (err instanceof DiscountError) return { errors: { code: err.message }, values };
    throw err;
  }
  revalidatePath("/admin/discounts");
  return { errors: {}, created: d.code };
}

export async function setDiscountActiveAction(id: string, isActive: boolean) {
  const { user } = await requireAdmin({ roles: ["owner"] });
  if (!z.uuid().safeParse(id).success) return;
  await setCodeActive(db, id, isActive, user.id);
  revalidatePath("/admin/discounts");
}
