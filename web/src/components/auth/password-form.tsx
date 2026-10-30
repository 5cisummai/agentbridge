import { IconArrowRight, IconLoader2 } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeAuthNavigation, safeSameOriginPath } from "@/lib/safe-url";

type PasswordFormProps = {
  mode: "login" | "signup";
};

export function PasswordForm({ mode }: PasswordFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function sendVerification(targetEmail: string) {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: targetEmail,
          callbackURL: "/",
        }),
      });
      if (!res.ok) {
        setError("Could not send verification email. Try again.");
        return;
      }
      setInfo("Verification email sent. Check your inbox.");
    } catch {
      setError("Could not send verification email. Try again.");
    } finally {
      setResending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const query = new URLSearchParams(location.search);
    const trimmedEmail = email.trim();
    const endpoint =
      mode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          ...(mode === "signup"
            ? {
                name: name.trim() || trimmedEmail.split("@")[0] || "User",
              }
            : {}),
          ...(mode === "login" && query.has("sig")
            ? { oauth_query: location.search.slice(1) }
            : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        token?: string | null;
        code?: string;
        message?: string;
      };

      if (!res.ok) {
        const unverified =
          res.status === 403 ||
          data.code === "EMAIL_NOT_VERIFIED" ||
          /not verified|verify your email/i.test(data.message ?? "");
        if (mode === "login" && unverified) {
          setPendingVerification(true);
          setError(null);
          setInfo("Verify your email before signing in.");
          return;
        }
        setError(
          mode === "signup"
            ? "Could not create account. Try again."
            : "Sign in failed",
        );
        return;
      }

      // With requireEmailVerification, sign-up succeeds without a session token.
      if (mode === "signup" && !data.token) {
        setPendingVerification(true);
        setInfo("Check your email for a verification link.");
        return;
      }

      const destination =
        safeAuthNavigation(data.url) ??
        safeSameOriginPath(query.get("redirect")) ??
        "/";
      location.assign(destination);
    } catch {
      setError(
        mode === "signup"
          ? "Could not create account. Try again."
          : "Sign in failed",
      );
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Verify your email</p>
          <p className="text-muted-foreground">
            We sent a verification link to{" "}
            <span className="text-foreground">{email.trim()}</span>. Open it to
            finish creating your account.
          </p>
        </div>
        {info ? <p className="text-muted-foreground">{info}</p> : null}
        {error ? (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full gap-2"
          disabled={resending || !email.trim()}
          onClick={() => void sendVerification(email.trim())}
        >
          {resending ? <IconLoader2 className="animate-spin" /> : null}
          Resend verification email
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {mode === "signup" ? (
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 px-3"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 px-3"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10 px-3"
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-10 w-full gap-2" disabled={loading}>
        {loading ? <IconLoader2 className="animate-spin" /> : null}
        {mode === "signup" ? "Create account" : "Sign in"}
        {!loading ? <IconArrowRight data-icon="inline-end" /> : null}
      </Button>
    </form>
  );
}
