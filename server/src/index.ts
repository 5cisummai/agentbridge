import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth } from "./auth/index.js";
import { ensureRunnerOAuthClient } from "./auth/bootstrap-runner.js";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { createHubRegistry } from "./hub/registry.js";
import { initOtel } from "./otel.js";
import { startApprovalTimeoutJob } from "./services/approval-timeout.js";

async function main() {
  const env = loadEnv();
  initOtel(env);

  const gatewayDb = createDb(env);
  const auth = createAuth(env, gatewayDb);
  const hub = createHubRegistry({ db: gatewayDb.db, env });

  await ensureRunnerOAuthClient(auth, env, gatewayDb.db);

  const app = createApp({ env, gatewayDb, hub, auth });
  const stopApprovalJob = startApprovalTimeoutJob({
    env,
    gatewayDb,
    hub,
    auth,
  });

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      createServer,
    },
    (info) => {
      console.log(
        `clithread gateway listening on http://localhost:${info.port}`,
      );
    },
  );

  hub.attachWebSocket(server as import("node:http").Server);

  const shutdown = () => {
    stopApprovalJob();
    hub.close();
    void gatewayDb.client.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
