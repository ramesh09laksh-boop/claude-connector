import Link from "next/link";
import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth-form-shell";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a link to set a new Lanes password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthFormShell
      title="Forgot your password?"
      subtitle="Tell us your email and we'll send you a link to set a new one."
      footer={
        <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthFormShell>
  );
}
