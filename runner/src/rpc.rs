use std::sync::Arc;

use serde_json::{json, Value};

use crate::profiles::{ProfileUpsert, Profiles};
use crate::protocol::{
    ApprovalResolveParams, JsonRpcRequest, JsonRpcResponse, RequestId, ThreadSpawnParams,
    ERR_CWD_NOT_ALLOWED, ERR_INVALID_PARAMS, ERR_METHOD_NOT_FOUND, ERR_THREAD_LIMIT,
};
use crate::threads::ThreadManager;

pub async fn dispatch_rpc(
    profiles: &Arc<Profiles>,
    threads: &Arc<ThreadManager>,
    req: &JsonRpcRequest,
) -> JsonRpcResponse {
    let id = req.id.clone();
    match req.method.as_str() {
        "thread.spawn" => {
            let params: ThreadSpawnParams = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            match threads.spawn(params).await {
                Ok(v) => JsonRpcResponse::result(id, v),
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("cwd_not_allowed") {
                        error_response(id, ERR_CWD_NOT_ALLOWED, "cwd_not_allowed")
                    } else if msg == "thread_limit" {
                        error_response(id, ERR_THREAD_LIMIT, "thread_limit")
                    } else {
                        error_response(id, ERR_INVALID_PARAMS, &msg)
                    }
                }
            }
        }
        "thread.send" => {
            let p: Value = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            let thread_id = p.get("thread_id").and_then(|v| v.as_str()).unwrap_or("");
            let input = p.get("input").and_then(|v| v.as_str()).unwrap_or("");
            match threads.send(thread_id, input).await {
                Ok(v) => JsonRpcResponse::result(id, v),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        "thread.kill" => {
            let p: Value = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            let thread_id = p.get("thread_id").and_then(|v| v.as_str()).unwrap_or("");
            match threads.kill(thread_id).await {
                Ok(v) => JsonRpcResponse::result(id, v),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        "thread.list" => match threads.list().await {
            Ok(v) => JsonRpcResponse::result(id, v),
            Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
        },
        "profile.list" => match profiles.list() {
            Ok(rows) => JsonRpcResponse::result(id, json!({ "profiles": rows })),
            Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
        },
        "profile.upsert" => {
            let p: Value = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            let profile_val = p.get("profile").cloned().unwrap_or(p);
            let upsert: ProfileUpsert = match serde_json::from_value(profile_val) {
                Ok(u) => u,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            };
            match profiles.upsert_mcp(upsert) {
                Ok(()) => JsonRpcResponse::result(id, json!({ "ok": true })),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        "profile.delete" => {
            let p: Value = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            let profile_id = p.get("profile_id").and_then(|v| v.as_str()).unwrap_or("");
            match profiles.delete(profile_id) {
                Ok(()) => JsonRpcResponse::result(id, json!({ "ok": true })),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        "workspace.list_roots" => match profiles.list_roots() {
            Ok(roots) => JsonRpcResponse::result(
                id,
                json!({
                    "roots": roots.iter().map(|(id, path, label)| json!({
                        "id": id, "path": path, "label": label
                    })).collect::<Vec<_>>()
                }),
            ),
            Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
        },
        "workspace.add_root" => {
            let p: Value = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            let path = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
            match profiles.add_root(path, None) {
                Ok(()) => JsonRpcResponse::result(id, json!({ "ok": true })),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        "workspace.remove_root" => {
            let p: Value = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            let path = p.get("path").and_then(|v| v.as_str()).unwrap_or("");
            match profiles.remove_root(path) {
                Ok(()) => JsonRpcResponse::result(id, json!({ "ok": true })),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        "approval.resolve" => {
            let params: ApprovalResolveParams = match parse_params(req) {
                Ok(p) => p,
                Err(e) => return error_response(id, ERR_INVALID_PARAMS, &e),
            };
            match threads.resolve_approval(params).await {
                Ok(v) => JsonRpcResponse::result(id, v),
                Err(e) => error_response(id, ERR_INVALID_PARAMS, &e.to_string()),
            }
        }
        _ => error_response(
            id,
            ERR_METHOD_NOT_FOUND,
            &format!("Method not found: {}", req.method),
        ),
    }
}

fn parse_params<T: serde::de::DeserializeOwned>(req: &JsonRpcRequest) -> Result<T, String> {
    let params = req.params.clone().unwrap_or(json!({}));
    serde_json::from_value(params).map_err(|e| e.to_string())
}

fn error_response(id: Option<RequestId>, code: i32, message: &str) -> JsonRpcResponse {
    JsonRpcResponse::error(id, code, message, None)
}
