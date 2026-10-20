import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/admin/ui";
import { ForgotPasswordForm } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" intro="We'll email you a link to set a new one.">
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/admin/login" className="link">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
