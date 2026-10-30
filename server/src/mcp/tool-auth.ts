import { createInsufficientScopeError } from "better-auth/oauth2";
import { AGENTBRIDGE_SCOPES, hasScope, subjectFromClaims } from "./scopes.js";

export type ToolAuth = {
  userId: string;
  scopes: Set<string>;
  claims: Record<string, unknown>;
};

export function toolAuthFromClaims(claims: Record<string, unknown>): ToolAuth {
  return {
    userId: subjectFromClaims(claims),
    scopes: new Set(
      typeof claims.scope === "string"
        ? claims.scope.split(/\s+/).filter(Boolean)
        : [],
    ),
    claims,
  };
}

export function requireScopes(auth: ToolAuth, scopes: string | string[]) {
  const list = Array.isArray(scopes) ? scopes : [scopes];
  if (!hasScope([...auth.scopes], list)) {
    throw createInsufficientScopeError(list);
  }
}

export function mcpTextResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export { AGENTBRIDGE_SCOPES };
