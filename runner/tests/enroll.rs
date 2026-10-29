use agentbridge_runner::DEVICE_CODE_GRANT;
use agentbridge_runner::RUNNER_OAUTH_CLIENT_ID;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn enroll_flow_mock() {
    let server = MockServer::start().await;
    let base = server.uri();

    Mock::given(method("POST"))
        .and(path("/api/auth/device/code"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "device_code": "dc",
            "user_code": "ABCD-1234",
            "verification_uri": format!("{base}/device"),
            "expires_in": 600,
            "interval": 1
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/api/auth/oauth2/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "access_token": "at",
            "token_type": "Bearer"
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/devices/enroll"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "device_id": "00000000-0000-4000-8000-000000000001",
            "device_secret": "ds",
            "device_name": "test"
        })))
        .mount(&server)
        .await;

    let dir = tempfile::tempdir().unwrap();
    std::env::set_var("AGENTBRIDGE_TEST_DIR", dir.path());

    agentbridge_runner::enroll::oauth::run_enroll(Some(base.clone()), Some("test".into()))
        .await
        .unwrap();

    let cred = agentbridge_runner::enroll::DeviceCredential::load()
        .unwrap()
        .unwrap();
    assert_eq!(cred.device_id, "00000000-0000-4000-8000-000000000001");
    assert_eq!(cred.device_secret, "ds");
    let _ = (RUNNER_OAUTH_CLIENT_ID, DEVICE_CODE_GRANT);
}
