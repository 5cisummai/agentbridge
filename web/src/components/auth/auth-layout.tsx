import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AuthPanel } from "@/components/auth-panel";
import { GitHubIcon, GoogleIcon } from "@/components/auth/icons";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

async function socialSignIn(provider: "github" | "google") {
  const res = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      provider,
      callbackURL: "/",
    }),
  });
  if (!res.ok) {
    throw new Error(`${provider} sign-in is not configured`);
  }
  const data = (await res.json()) as { url?: string };
  if (data.url) {
    location.href = data.url;
  }
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="relative grid min-h-full flex-1 lg:grid-cols-2">
      <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
        <ModeToggle />
      </div>
      <div className="flex flex-col justify-center border-border px-6 py-12 sm:px-10 lg:border-r lg:px-16">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          <div className="relative my-8">
            <Separator />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">
                Or continue with
              </span>
            </span>
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center gap-2.5"
              onClick={() => void socialSignIn("google").catch(() => undefined)}
            >
              <GoogleIcon className="size-4" />
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center gap-2.5"
              onClick={() => void socialSignIn("github").catch(() => undefined)}
            >
              <GitHubIcon className="size-4" />
              Continue with GitHub
            </Button>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {footer}
          </p>
        </div>
      </div>

      <AuthPanel />
    </div>
  );
}

export function AuthLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="font-medium text-foreground underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
