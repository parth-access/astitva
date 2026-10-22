"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { AccountError, deleteAccount, deleteAddress, MAX_ADDRESSES, saveAddress, setDefaultAddress, updateDetails } from "@/modules/account/service";
import { parseAddressForm, parseDetailsForm, parseSignUpForm, type FieldErrors } from "@/modules/account/input";
import { customerAuth, requireCustomer } from "@/modules/auth/customer";
import { safeNext } from "@/modules/auth/customer-config";
import { allowRequest } from "@/modules/limits/request";
import { LIMITS } from "@/modules/limits/service";

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

/**
 * Name, mobile, email and password make an account and sign it in. The email
 * isn't verified yet: Your details asks for that. Checked here first, so each
 * field can say what's wrong; Better Auth checks the password again.
 */
export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = valuesOf(form);
  delete values.password;
  const parsed = parseSignUpForm(form);
  if (!parsed.ok) return { errors: parsed.errors, values };
  if (!(await allowRequest(LIMITS.signUp))) {
    return { errors: { form: "That's a few new accounts from here in a short time. Please try again in an hour." }, values };
  }
  const { name, phone, email, password } = parsed.data;
  try {
    await customerAuth.api.signUpEmail({ body: { name, email, password, phone }, headers: await headers() });
  } catch (e) {
    const code = (e as { body?: { code?: string } }).body?.code ?? "";
    if (code.startsWith("USER_ALREADY_EXISTS")) {
      return { errors: { email: "There's already an account with this email. Sign in instead, or set a new password with “Forgot it?”." }, values };
    }
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return { errors: { password: "Use 8 to 128 characters." }, values };
    throw e;
  }
  redirect(safeNext(form.get("next"), "/account/details?welcome=1"));
}
