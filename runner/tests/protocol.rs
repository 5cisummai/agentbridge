use clithread_runner::protocol::{DeviceHelloParams, JsonRpcRequest, RequestId, ThreadEventParams};
use serde_json::json;

#[test]
fn hello_roundtrip() {
    let req = JsonRpcRequest::request(
        RequestId::Str("hello-1".into()),
        "device.hello",
        serde_json::to_value(DeviceHelloParams {
            device_id: uuid::Uuid::new_v4().to_string(),
            credential: "secret".into(),
            name: Some("dev".into()),
            capabilities: None,
        })
        .unwrap(),
    );
    let raw = serde_json::to_string(&req).unwrap();
    let back: JsonRpcRequest = serde_json::from_str(&raw).unwrap();
    assert_eq!(back.method, "device.hello");
}

#[test]
fn thread_event_shape() {
    let ev = ThreadEventParams {
        thread_id: uuid::Uuid::new_v4().to_string(),
        seq: 1,
        event_type: "assistant".into(),
        payload: json!({ "text": "hi" }),
        raw: None,
    };
    let v = serde_json::to_value(&ev).unwrap();
    assert_eq!(v["type"], "assistant");
}
