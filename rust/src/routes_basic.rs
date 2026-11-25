// 班级 / UID / 模板
use serde_json::{json, Map, Value};

use crate::app::*;
use crate::core::parse_uid;
use crate::crypto;
use crate::http::{url_encode_utf8, Request, Response};
use crate::template::TEMPLATE_TEXT;

pub fn route_classes_list(_req: &Request, st: &AppState) -> Response {
    let list = load_classes(st);
    let mut out = Vec::new();
    for c in list {
        out.push(json!({
            "id": c.get("id").and_then(|v| v.as_str()).unwrap_or(""),
            "name": c.get("name").and_then(|v| v.as_str()).unwrap_or(""),
            "created_at": c.get("created_at").and_then(|v| v.as_str()).unwrap_or(""),
        }));
    }
    Response::json(&Value::Array(out), 200)
}

fn body_json(req: &Request) -> Result<Value, Response> {
    if req.body.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&req.body).map_err(|_| Response::error("请求体不是合法 JSON", 400, None))
}

pub fn route_class_create(req: &Request, st: &AppState) -> Response {
    let p = match body_json(req) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let class_name = p.get("class_name").and_then(|v| v.as_str()).unwrap_or("");
    let class_password = p.get("class_password").and_then(|v| v.as_str()).unwrap_or("");
    let token = p.get("token").and_then(|v| v.as_str()).unwrap_or("");
    let json_data = p.get("json_data").and_then(|v| v.as_str()).unwrap_or("");
    if class_name.is_empty() || class_password.is_empty() || token.is_empty() || json_data.is_empty() {
        return Response::error("缺少必要字段", 400, None);
    }
    if !verify_token(st, token) {
        return Response::error("Token无效或已使用", 401, None);
    }

    let class_id = format!("class_{}", crate::core::ms_timestamp());
    let data: Value = match serde_json::from_str(json_data) {
        Ok(v) => v,
        Err(_) => return Response::error("json_data 不是合法 JSON", 400, None),
    };

    let store = st.class_store(&class_id);
    store.set("data", &crypto::encrypt_json(&data, class_password));
    store.set("password_hash", &crypto::sha256_hex(class_password));

    let mut classes = load_classes(st);
    classes.push(json!({
        "id": class_id,
        "name": class_name,
        "created_at": crate::core::utc_stamp(),
    }));
    save_classes(st, &classes);

    Response::json(
        &json!({"id": class_id, "name": class_name, "message": "创建成功"}),
        201,
    )
}

pub fn route_class_get(req: &Request, st: &AppState, students_only: bool) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("班级不存在", 404, None),
    };
    let password = req.header("x-password").unwrap_or("");
    let password_hash = req.header("x-password-hash").unwrap_or("");
    if password.is_empty() {
        return Response::error("缺少密码参数", 400, None);
    }
    if password_hash.is_empty() {
        return Response::error("缺少密码哈希参数", 400, None);
    }

    let store = st.class_store(&class_id);
    let enc = store.get("data").unwrap_or_default();
    if enc.is_empty() {
        return Response::error("班级不存在", 404, None);
    }
    if !hash_matches(&store, password_hash) {
        return Response::error("密码错误", 401, None);
    }
    let data = match crypto::decrypt_json(&enc, password) {
        Some(d) => d,
        None => return Response::error("密码错误", 401, None),
    };

    if students_only {
        let teachers = match req.param("teachers") {
            Some(t) => {
                let t = t.to_ascii_lowercase();
                t == "1" || t == "true" || t == "yes"
            }
            None => false,
        };
        let students = extract_students(&data, teachers);
        let count = students.as_object().map(|m| m.len()).unwrap_or(0);
        return Response::json(
            &json!({"class_id": class_id, "count": count, "students": students}),
            200,
        );
    }
    Response::json(&json!({"data": data}), 200)
}

pub fn route_class_post(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("班级不存在", 404, None),
    };
    let password = req.header("x-password").unwrap_or("");
    let password_hash = req.header("x-password-hash").unwrap_or("");
    if password.is_empty() {
        return Response::error("缺少密码参数", 400, None);
    }
    if password_hash.is_empty() {
        return Response::error("缺少密码哈希参数", 400, None);
    }
    let body = match body_json(req) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let data = match body.get("data") {
        Some(d) => d.clone(),
        None => return Response::error("缺少 data 字段", 400, None),
    };

    let store = st.class_store(&class_id);
    if !hash_matches(&store, password_hash) {
        return Response::error("密码错误", 401, None);
    }
    store.set("data", &crypto::encrypt_json(&data, password));
    let stored = store.get("password_hash").unwrap_or_default();
    if stored.is_empty() {
        store.set("password_hash", password_hash);
    }
    Response::json(&json!({"message": "保存成功"}), 200)
}

// ---------- UID 字典 ----------
pub fn load_uuids_sorted(store: &crate::store::Store) -> Value {
    let raw = store.get("uuids").unwrap_or_default();
    let parsed: Value = if raw.is_empty() {
        json!({})
    } else {
        serde_json::from_str(&raw).unwrap_or_else(|_| json!({}))
    };
    let map = match parsed {
        Value::Object(m) => m,
        _ => return json!({}),
    };
    let mut by_id: Vec<(i64, Vec<u8>)> = Vec::new();
    for (k, v) in map {
        let sid: i64 = match k.trim().parse() {
            Ok(n) => n,
            Err(_) => continue,
        };
        if let Some(uid) = parse_uid(&v) {
            by_id.push((sid, uid));
        }
    }
    by_id.sort_by_key(|(sid, _)| *sid);
    let mut out = Map::new();
    for (sid, uid) in by_id {
        out.insert(sid.to_string(), json!(uid));
    }
    Value::Object(out)
}

fn ordered_uuids(map: &Map<String, Value>) -> Value {
    let mut by_id: Vec<(i64, Value)> = Vec::new();
    for (k, v) in map {
        if let Ok(n) = k.trim().parse::<i64>() {
            by_id.push((n, v.clone()));
        }
    }
    by_id.sort_by_key(|(n, _)| *n);
    let mut out = Map::new();
    for (sid, uid) in by_id {
        out.insert(sid.to_string(), uid);
    }
    Value::Object(out)
}

pub fn route_uuids_get(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("班级不存在", 404, None),
    };
    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }
    let uuids = load_uuids_sorted(&store);
    let count = uuids.as_object().map(|m| m.len()).unwrap_or(0);
    Response::json(&json!({"class_id": class_id, "count": count, "uuids": uuids}), 200)
}

pub fn route_uuids_add(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("班级不存在", 404, None),
    };
    let body = match body_json(req) {
        Ok(v) => v,
        Err(r) => return r,
    };
    if !body.is_object() {
        return Response::error("请求体不是合法 JSON", 400, None);
    }

    let sid_raw = body.get("student_id").or_else(|| body.get("id"));
    let uid_raw = body.get("uid").or_else(|| body.get("uuid"));
    let sid_raw = match sid_raw {
        Some(v) if !v.is_null() => v,
        _ => return Response::error("缺少 student_id", 400, None),
    };
    let uid_raw = match uid_raw {
        Some(v) if !v.is_null() => v,
        _ => return Response::error("缺少 uid", 400, None),
    };

    let sid_num: i64 = if let Some(n) = sid_raw.as_i64() {
        n
    } else if let Some(s) = sid_raw.as_str() {
        match s.trim().parse::<i64>() {
            Ok(n) if n >= 0 => n,
            _ => return Response::error("缺少或非法的 student_id", 400, None),
        }
    } else {
        return Response::error("缺少或非法的 student_id", 400, None);
    };
    if sid_num < 0 {
        return Response::error("缺少或非法的 student_id", 400, None);
    }

    let uid = match parse_uid(uid_raw) {
        Some(u) => u,
        None => return Response::error("缺少或非法的 uid（1~7 字节）", 400, None),
    };

    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }

    let uuids = load_uuids_sorted(&store);
    let sid = sid_num.to_string();
    let mut map = match uuids {
        Value::Object(m) => m,
        _ => Map::new(),
    };

    // 同一张卡不能绑两个学号
    for (k, v) in map.iter() {
        if k == &sid {
            continue;
        }
        if parse_uid(v).as_deref() == Some(uid.as_slice()) {
            return Response::error(&format!("该 UID 已绑定学号 {}", k), 400, None);
        }
    }

    let added = !map.contains_key(&sid);
    map.insert(sid, json!(uid));

    let ordered = ordered_uuids(&map);
    store.set("uuids", &serde_json::to_string(&ordered).unwrap_or_default());
    let count = ordered.as_object().map(|m| m.len()).unwrap_or(0);

    Response::json(
        &json!({
            "message": if added { "已追加" } else { "已更新" },
            "class_id": class_id,
            "added": added,
            "count": count,
            "uuids": ordered,
        }),
        200,
    )
}

pub fn route_uuids_post(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("班级不存在", 404, None),
    };
    let body = match body_json(req) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let mapping = match body.get("uuids") {
        Some(v) => v.clone(),
        None => body.clone(),
    };
    let mapping = match mapping {
        Value::Object(m) => m,
        _ => return Response::error("缺少 uuids（学号 -> UID 的 dict）", 400, None),
    };

    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }

    let mut normalized: Vec<(i64, Vec<u8>)> = Vec::new();
    let mut seen: Vec<Vec<u8>> = Vec::new();
    for (sid, val) in mapping.iter() {
        let n: i64 = match sid.trim().parse() {
            Ok(n) => n,
            Err(_) => return Response::error(&format!("非法学号: {}", sid), 400, None),
        };
        let uid = match parse_uid(val) {
            Some(u) => u,
            None => {
                return Response::error(
                    &format!("学号 {} 的 UID 非法（需要 1~7 字节）", n),
                    400,
                    None,
                )
            }
        };
        if seen.contains(&uid) {
            return Response::error("存在重复的 UID，同一张卡不能绑定多个学号", 400, None);
        }
        seen.push(uid.clone());
        normalized.push((n, uid));
    }
    normalized.sort_by_key(|(n, _)| *n);

    let mut out = Map::new();
    for (sid, uid) in normalized {
        out.insert(sid.to_string(), json!(uid));
    }
    let ordered = Value::Object(out);
    store.set("uuids", &serde_json::to_string(&ordered).unwrap_or_default());
    let count = ordered.as_object().map(|m| m.len()).unwrap_or(0);

    Response::json(
        &json!({"message": "已保存", "class_id": class_id, "count": count, "uuids": ordered}),
        200,
    )
}

pub fn route_template() -> Response {
    Response::text(
        TEMPLATE_TEXT.as_bytes().to_vec(),
        200,
        "text/markdown; charset=utf-8",
    )
    .with_header(
        "Content-Disposition",
        &format!(
            "attachment; filename=\"template.md\"; filename*=UTF-8''{}",
            url_encode_utf8("班级数据收集指令.md")
        ),
    )
}
