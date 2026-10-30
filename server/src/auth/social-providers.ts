import type { Env } from "../env.js";

export type SocialProviderId = "github" | "google";

export function enabledSocialProviders(env: Env): SocialProviderId[] {
  const providers: SocialProviderId[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.push("github");
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push("google");
  }
  return providers;
}

export function buildSocialProviders(env: Env) {
  const providers: {
    github?: { clientId: string; clientSecret: string };
    google?: { clientId: string; clientSecret: string };
  } = {};

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}
