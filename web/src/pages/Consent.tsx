import { useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function ConsentPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function consent(accept: boolean) {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accept,
          oauth_query: location.search.slice(1),
        }),
      });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) {
        throw new Error("Consent failed. Please sign in and try again.");
      }
      location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consent failed");
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
        <ModeToggle />
      </div>
      <div className="w-full max-w-[360px] space-y-6">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            Consent
          </h1>
          <p className="text-sm text-muted-foreground">
            Authorize this MCP client to access agentbridge on your account.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="h-10"
            disabled={pending}
            onClick={() => void consent(true)}
          >
            Authorize
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending}
            onClick={() => void consent(false)}
          >
            Deny
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
