import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/admin/ui";
import { LoginForm, SignOutButton } from "@/components/admin/auth-forms";
import { getAdmin } from "@/modules/auth/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { denied } = await searchParams;
  const admin = await getAdmin();

  if (admin && !admin.role) {
    return (
      <AuthCard title="No admin access">
        <div className="space-y-5">
          <Notice>
            {admin.user.email} is signed in but doesn&apos;t have access to the admin. Ask an owner to add you.
          </Notice>
          <SignOutButton className="btn-outline w-full" />
        </div>
      </AuthCard>
    );
  }
  if (admin && !denied) redirect(admin.user.twoFactorEnabled ? "/admin" : "/admin/setup-2fa");

  return (
    <AuthCard title="Sign in">
      <LoginForm />
    </AuthCard>
  );
}
