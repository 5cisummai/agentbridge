// Scope strings remain stable for compatibility with existing OAuth clients.
export const CLITHREAD_SCOPES = {
  devices: "agentbridge:devices",
  threads: "agentbridge:threads",
  profiles: "agentbridge:profiles",
  approvals: "agentbridge:approvals",
  admin: "agentbridge:admin",
} as const;

export type ClithreadScope =
  (typeof CLITHREAD_SCOPES)[keyof typeof CLITHREAD_SCOPES];

export function parseScopeClaim(scope: unknown): Set<string> {
  if (typeof scope === "string") {
    return new Set(scope.split(/\s+/).filter(Boolean));
  }
  if (Array.isArray(scope)) {
    return new Set(scope.filter((s): s is string => typeof s === "string"));
  }
  return new Set();
}

export function hasScope(
  scopeClaim: unknown,
  required: string | string[],
): boolean {
  const scopes = parseScopeClaim(scopeClaim);
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((s) => scopes.has(s));
}

export function subjectFromClaims(claims: Record<string, unknown>): string {
  const sub = claims.sub;
  if (typeof sub !== "string" || !sub) {
    throw new Error("invalid_token");
  }
  return sub;
}
