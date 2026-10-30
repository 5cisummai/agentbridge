import { AuthLayout, AuthLink } from "@/components/auth/auth-layout";
import { PasswordForm } from "@/components/auth/password-form";

export function SignUpPage() {
  return (
    <AuthLayout
      title="Sign up"
      description="Create an account to authorize MCP clients and devices."
      footer={
        <>
          Already have an account? <AuthLink to="/sign-in">Sign in</AuthLink>
        </>
      }
    >
      <PasswordForm mode="signup" />
    </AuthLayout>
  );
}
