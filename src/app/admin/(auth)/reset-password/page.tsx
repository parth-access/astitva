import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, Notice } from "@/components/admin/ui";
import { ResetPasswordForm } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Set your password" };

/** Better Auth sends the emailed link here with ?token=… (or ?error=INVALID_TOKEN). */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/admin/reset-password">) {
  const { token, error } = await searchParams;
  if (typeof token !== "string" || error) {
    return (
      <AuthCard title="This link has expired">
        <div className="space-y-5">
          <Notice>Links work once, for one hour. Ask for a new one.</Notice>
          <Link href="/admin/forgot-password" className="btn-primary w-full">
            Send a new link
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set your password">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
