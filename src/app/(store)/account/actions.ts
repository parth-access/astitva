"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { AccountError, deleteAccount, deleteAddress, MAX_ADDRESSES, saveAddress, setDefaultAddress, updateDetails } from "@/modules/account/service";
import { parseAddressForm, parseDetailsForm, type FieldErrors } from "@/modules/account/input";
import { customerAuth, requireCustomer } from "@/modules/auth/customer";

export type FormState = { errors: FieldErrors; values?: Record<string, string>; saved?: number };

const valuesOf = (form: FormData) => Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string"));

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveAddressAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { id: userId } = await requireCustomer("/account/addresses");
  const parsed = parseAddressForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: valuesOf(form) };
  const id = String(form.get("id") ?? "");
  try {
    await saveAddress(db, userId, { ...parsed.data, id: uuid.test(id) ? id : null, makeDefault: form.get("makeDefault") === "on" });
  } catch (e) {
    if (e instanceof AccountError) {
      const message = e.reason === "too_many_addresses" ? `You can keep up to ${MAX_ADDRESSES} addresses. Remove one first.` : "That address has gone. Please reload the page.";
      return { errors: { form: message }, values: valuesOf(form) };
    }
    throw e;
  }
  refresh();
  return { errors: {}, saved: Date.now() };
}

export async function setDefaultAddressAction(id: string): Promise<void> {
  const { id: userId } = await requireCustomer("/account/addresses");
  if (!uuid.test(id)) return;
  await setDefaultAddress(db, userId, id).catch((e) => {
    if (!(e instanceof AccountError)) throw e;
  });
  refresh();
}

export async function deleteAddressAction(id: string): Promise<void> {
  const { id: userId } = await requireCustomer("/account/addresses");
  if (!uuid.test(id)) return;
  await deleteAddress(db, userId, id).catch((e) => {
    if (!(e instanceof AccountError)) throw e;
  });
  refresh();
}

export async function saveDetailsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { id: userId } = await requireCustomer("/account/details");
  const parsed = parseDetailsForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values: valuesOf(form) };
  await updateDetails(db, userId, parsed.data);
  refresh();
  return { errors: {}, saved: Date.now() };
}

export async function signOutAction(): Promise<void> {
  await customerAuth.api.signOut({ headers: await headers() });
  redirect("/");
}

/** Ends every session: a lost phone, a shared computer. */
export async function signOutEverywhereAction(): Promise<void> {
  await requireCustomer("/account/details");
  const h = await headers();
  await customerAuth.api.revokeSessions({ headers: h });
  await customerAuth.api.signOut({ headers: h }).catch(() => undefined);
  redirect("/account/sign-in?signed-out=everywhere");
}

export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { id: userId } = await requireCustomer("/account/details");
  if (form.get("confirm") !== "delete") return { errors: { confirm: "Type delete to confirm." } };
  // Sign out first, so the cookie goes with the session.
  await customerAuth.api.signOut({ headers: await headers() });
  await deleteAccount(db, userId);
  redirect("/account/sign-in?deleted=1");
}
