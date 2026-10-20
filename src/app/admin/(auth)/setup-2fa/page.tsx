import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/ui";
import { SetupTwoFactor, SignOutButton } from "@/components/admin/auth-forms";
import { getAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Set up sign-in codes" };

/** The only admin page a session without 2FA can reach (see requireAdmin). */
export default async function SetupTwoFactorPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (!admin.role) redirect("/admin/login?denied=1");
  if (admin.user.twoFactorEnabled) redirect("/admin");

  return (
    <AuthCard
      title="Protect your account"
      intro="Every admin signs in with a password and a 6-digit code from an app on their phone. It takes a minute to set up."
    >
      <SetupTwoFactor />
      <p className="mt-8 text-center">
        <SignOutButton />
      </p>
    </AuthCard>
  );
}
