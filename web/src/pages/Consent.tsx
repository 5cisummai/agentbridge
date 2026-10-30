import { useEffect, useMemo, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type PublicClient = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
};

const SCOPE_LABELS: Record<string, string> = {
  openid: "Sign you in",
  profile: "Basic profile",
  offline_access: "Stay signed in (refresh tokens)",
  "agentbridge:devices": "Manage devices",
  "agentbridge:threads": "Create and control CLI threads",
  "agentbridge:profiles": "Read CLI profiles",
  "agentbridge:approvals": "Handle approval prompts",
  "agentbridge:admin": "Admin actions",
};

function parseOAuthQuery(search: string) {
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id");
  const scope = params.get("scope");
  const scopes = scope ? scope.split(/\s+/).filter(Boolean) : [];
  return { clientId, scopes };
}

export function ConsentPage() {
  const oauthQuery = useMemo(() => location.search.slice(1), []);
  const { clientId, scopes } = useMemo(
    () => parseOAuthQuery(location.search),
    [],
  );

  const [client, setClient] = useState<PublicClient | null>(null);
  const [loadingClient, setLoadingClient] = useState(Boolean(clientId));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setLoadingClient(false);
      return;
    }

    let cancelled = false;
    setLoadingClient(true);

    void fetch(
      `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as PublicClient;
      })
      .then((data) => {
        if (!cancelled && data) setClient(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingClient(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

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
          oauth_query: oauthQuery,
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

  const displayName =
    client?.client_name?.trim() || clientId || "this MCP client";

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
            {loadingClient
              ? "Loading client details…"
              : `${displayName} wants to access agentbridge on your account.`}
          </p>
        </div>

        {(client || clientId || scopes.length > 0) && !loadingClient ? (
          <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              {client?.logo_uri ? (
                <img
                  src={client.logo_uri}
                  alt=""
                  className="mt-0.5 size-10 rounded-md border border-border bg-background object-cover"
                />
              ) : (
                <div className="mt-0.5 flex size-10 items-center justify-center rounded-md border border-border bg-background font-heading text-sm font-semibold text-muted-foreground">
                  {(displayName[0] ?? "A").toUpperCase()}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium text-foreground">
                  {displayName}
                </p>
                {clientId ? (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {clientId}
                  </p>
                ) : null}
                {client?.client_uri ? (
                  <a
                    href={client.client_uri}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {client.client_uri}
                  </a>
                ) : null}
              </div>
            </div>

            {scopes.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Requested access
                  </p>
                  <ul className="space-y-1.5">
                    {scopes.map((scope) => (
                      <li key={scope} className="text-sm text-foreground">
                        <span className="font-medium">
                          {SCOPE_LABELS[scope] ?? scope}
                        </span>
                        {SCOPE_LABELS[scope] ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {scope}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}

            {client?.tos_uri || client?.policy_uri ? (
              <>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  {client.tos_uri ? (
                    <a
                      href={client.tos_uri}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      Terms
                    </a>
                  ) : null}
                  {client.tos_uri && client.policy_uri ? " · " : null}
                  {client.policy_uri ? (
                    <a
                      href={client.policy_uri}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      Privacy
                    </a>
                  ) : null}
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="h-10"
            disabled={pending || loadingClient}
            onClick={() => void consent(true)}
          >
            Authorize
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending || loadingClient}
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
