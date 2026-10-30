import type { Env } from "./env.js";

let shutdownOtel: (() => Promise<void>) | undefined;

export function initOtel(env: Env): void {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return;
  }

  void (async () => {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } =
      await import("@opentelemetry/exporter-trace-otlp-http");
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      }),
      serviceName: "agentbridge-gateway",
    });
    sdk.start();
    shutdownOtel = () => sdk.shutdown();
  })();
}

export async function shutdownOtelSdk() {
  await shutdownOtel?.();
}
