import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/admin/ui";
import { VerifyForm } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Enter your code" };

export default function VerifyPage() {
  return (
    <AuthCard title="Enter your code" intro="Open your authenticator app and type the 6-digit code for Astitva.">
      <VerifyForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/admin/login" className="link">
          Start again
        </Link>
      </p>
    </AuthCard>
  );
}
