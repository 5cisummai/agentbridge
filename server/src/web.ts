import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

const SPA_ROUTES = ["/", "/sign-in", "/sign-up", "/consent", "/device"] as const;

const MISSING_UI = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>agentbridge</title></head>
<body>
  <h1>Web UI not built</h1>
  <p>Run <code>pnpm --dir web build</code>, then restart the gateway.</p>
</body></html>`;

function candidateRoots(): string[] {
  const roots: string[] = [];
  if (process.env.WEB_DIST) {
    roots.push(path.resolve(process.env.WEB_DIST));
  }
  // Docker image copies the SPA to /app/public next to dist/.
  roots.push(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public"),
  );
  // Local `pnpm dev` from server/ → ../web/dist
  roots.push(path.resolve(process.cwd(), "../web/dist"));
  roots.push(path.resolve(process.cwd(), "web/dist"));
  return roots;
}

export function resolveWebDist(): string | null {
  for (const root of candidateRoots()) {
    if (existsSync(path.join(root, "index.html"))) {
      return root;
    }
  }
  return null;
}

export function mountWebApp(app: Hono) {
  const webDist = resolveWebDist();

  if (webDist) {
    app.use("/assets/*", serveStatic({ root: webDist }));
    app.use("/fonts/*", serveStatic({ root: webDist }));
    app.get("/favicon.svg", serveStatic({ root: webDist }));
  }

  for (const route of SPA_ROUTES) {
    app.get(route, async (c) => {
      if (!webDist) {
        return c.html(MISSING_UI);
      }
      return c.html(await readFile(path.join(webDist, "index.html"), "utf8"));
    });
  }
}
