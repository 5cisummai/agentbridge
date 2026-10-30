import { AuthLayout, AuthLink } from "@/components/auth/auth-layout";
import { PasswordForm } from "@/components/auth/password-form";

export function SignInPage() {
  return (
    <AuthLayout
      title="Sign in"
      description="Enter your email and password to continue."
      footer={
        <>
          Don&apos;t have an account? <AuthLink to="/sign-up">Sign up</AuthLink>
        </>
      }
    >
      <PasswordForm mode="login" />
    </AuthLayout>
  );
}
