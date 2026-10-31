import { useMemo, useState, type FormEvent } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api";

type DeviceMeta = {
  client_id?: string;
  scope?: string;
};

function normalizeUserCode(value: string): string {
  return value.trim().replace(/-/g, "").toUpperCase();
}

export function DevicePage() {
  const initialCode = useMemo(
    () => new URLSearchParams(location.search).get("user_code") ?? "",
    [],
  );
  const [userCode, setUserCode] = useState(initialCode);
  const [meta, setMeta] = useState<DeviceMeta | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState("");

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const code = normalizeUserCode(userCode);
    setUserCode(code);
    try {
      const res = await fetch(
        apiUrl(`/api/auth/device?user_code=${encodeURIComponent(code)}`),
        { credentials: "include" },
      );
      if (!res.ok) {
        setError("Invalid or expired code. Sign in first.");
        return;
      }
      setMeta((await res.json()) as DeviceMeta);
    } catch {
      setError("Could not look up that device code.");
    } finally {
      setPending(false);
    }
  }

  async function decide(path: "approve" | "deny") {
    setError("");
    setPending(true);
    try {
      await fetch(apiUrl(`/api/auth/device/${path}`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode }),
      });
      setDone(path === "approve" ? "Device approved." : "Device denied.");
      window.setTimeout(() => {
        location.href = "/";
      }, 700);
    } catch {
      setError("Could not complete device authorization.");
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
            Device authorization
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the code shown by your runner or CLI to link this device.
          </p>
        </div>

        {done ? (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            {done}
          </p>
        ) : meta ? (
          <>
            <p className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm">
              Client: {meta.client_id || "unknown"}
              <br />
              Scopes: {meta.scope || "none"}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="h-10"
                disabled={pending}
                onClick={() => void decide("approve")}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={pending}
                onClick={() => void decide("deny")}
              >
                Deny
              </Button>
            </div>
          </>
        ) : (
          <form className="space-y-6" onSubmit={lookup}>
            <div className="space-y-2">
              <Label htmlFor="user_code">Device code</Label>
              <Input
                id="user_code"
                name="user_code"
                required
                placeholder="ABCD-1234"
                value={userCode}
                onChange={(event) => setUserCode(event.target.value)}
                className="h-10 px-3 font-mono uppercase tracking-wider"
              />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={pending}>
              {pending ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
