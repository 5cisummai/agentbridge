import { IconArrowRight, IconLoader2 } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordFormProps = {
  mode: "login" | "signup";
};

function safeRedirect(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function PasswordForm({ mode }: PasswordFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams(location.search);
    const endpoint =
      mode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(mode === "signup"
            ? {
                name:
                  name.trim() || email.trim().split("@")[0] || "User",
              }
            : {}),
          ...(mode === "login" && query.has("sig")
            ? { oauth_query: location.search.slice(1) }
            : {}),
        }),
      });

      if (!res.ok) {
        setError(
          mode === "signup"
            ? "Could not create account. Try again."
            : "Sign in failed",
        );
        return;
      }

      const data = (await res.json()) as { url?: string };
      const redirect = safeRedirect(query.get("redirect"));
      location.href = data.url || redirect || "/";
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
