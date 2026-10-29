pub fn init_from_env() {
    if std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").is_err() {
        return;
    }
    // OTLP setup is optional; tracing subscriber still works without it.
}
