use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const JSONRPC_VERSION: &str = "2.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<RequestId>,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RequestId {
    Str(String),
    Num(i64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<RequestId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl JsonRpcRequest {
    pub fn notification(method: impl Into<String>, params: Value) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.into(),
            id: None,
            method: method.into(),
            params: Some(params),
        }
    }

    pub fn request(id: RequestId, method: impl Into<String>, params: Value) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.into(),
            id: Some(id),
            method: method.into(),
            params: Some(params),
        }
    }
}

impl JsonRpcResponse {
    pub fn result(id: Option<RequestId>, result: Value) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.into(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Option<RequestId>, code: i32, message: impl Into<String>, data: Option<Value>) -> Self {
        Self {
            jsonrpc: JSONRPC_VERSION.into(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.into(),
                data,
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceHelloParams {
    pub device_id: String,
    pub credential: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadSpawnParams {
    pub thread_id: String,
    pub profile: String,
    pub cwd: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_input: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadEventParams {
    pub thread_id: String,
    pub seq: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    pub payload: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalSubmitParams {
    pub thread_id: String,
    pub approval_id: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalResolveParams {
    pub approval_id: String,
    pub approved: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

pub const ERR_CWD_NOT_ALLOWED: i32 = -32010;
pub const ERR_THREAD_LIMIT: i32 = -32011;
pub const ERR_METHOD_NOT_FOUND: i32 = -32601;
pub const ERR_INVALID_PARAMS: i32 = -32602;
