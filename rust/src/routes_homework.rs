// 作业子系统（与 python/v0.46 行为对齐）
use serde_json::{json, Map, Value};

use crate::app::*;
use crate::core::*;
use crate::http::{Request, Response};

fn class_id_of(req: &Request) -> Result<String, Response> {
    get_class_id(&req.path).ok_or_else(|| Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")))
}

fn require_class_data(store: &crate::store::Store) -> Result<(), Response> {
    match store.get("data") {
        Some(d) if !d.is_empty() => Ok(()),
        _ => Err(Response::error("class not right", 401, Some("CLASS_NOT_RIGHT"))),
    }
}

fn load_meta(store: &crate::store::Store) -> Value {
    match store.get("homework_meta") {
        Some(raw) if !raw.is_empty() => serde_json::from_str(&raw).unwrap_or_else(|_| json!({})),
        _ => json!({}),
    }
}

pub fn route_homework_init(req: &Request, st: &AppState) -> Response {
    let class_id = match class_id_of(req) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let body: Value = match serde_json::from_str(if req.body.trim().is_empty() { "{}" } else { &req.body }) {
        Ok(v) => v,
        Err(_) => return Response::error("请求体不是合法 JSON", 400, None),
    };

    let student_count = match body.get("student_count").and_then(|v| v.as_i64()) {
        Some(n) => n,
        None => return Response::error("学生数量必须大于0", 400, None),
    };
    let subject_count = match body.get("subject_count").and_then(|v| v.as_i64()) {
        Some(n) => n,
        None => return Response::error("学科数量必须大于0", 400, None),
    };
    let names = match body.get("subject_names") {
        Some(Value::Object(m)) => m.clone(),
        _ => {
            return Response::error(
                "请提供学科名称映射,格式: { \"0\": \"语文\", \"1\": \"数学\" }",
                400,
                None,
            )
        }
    };

    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }

    if student_count < 1 {
        return Response::error("学生数量必须大于0", 400, None);
    }
    if subject_count < 1 {
        return Response::error("学科数量必须大于0", 400, None);
    }

    let mut normalized = Map::new();
    for i in 0..subject_count {
        let key = i.to_string();
        let v = match names.get(&key) {
            Some(v) => v,
            None => {
                return Response::error(
                    &format!("学科名称映射不完整,需要包含 0 到 {} 的所有学科", subject_count - 1),
                    400,
                    None,
                )
            }
        };
        let text = v.as_str().unwrap_or("");
        if text.is_empty() {
            return Response::error(&format!("学科 {} 的名称不能为空", i), 400, None);
        }
        normalized.insert(key, json!(text));
    }

    let existing = store.get("homework_meta").unwrap_or_default();
    if !existing.is_empty() {
        return Response::error("该班级已初始化作业系统,如需重新初始化请先删除数据", 400, None);
    }

    let start = match body.get("start_date").and_then(|v| v.as_str()) {
        Some(s) => parse_date(s).unwrap_or_else(today_local),
        None => today_local(),
    };

    let actual_students = (student_count + 1) as usize;
    let subjects = subject_count as usize;
    let data: HwData = vec![vec![vec![0u8; subjects]; actual_students]];
    if !hw_save(&store, &data, &creds.password) {
        return Response::error("保存作业数据失败", 400, None);
    }

    let meta = json!({
        "studentCount": student_count,
        "subjectCount": subject_count,
        "subjectNames": Value::Object(normalized.clone()),
        "initializedAt": utc_stamp(),
        "startDate": iso_date(&start),
    });
    store.set("homework_meta", &serde_json::to_string(&meta).unwrap_or_default());

    Response::json(
        &json!({
            "success": true,
            "message": "作业系统初始化成功",
            "meta": {
                "studentCount": student_count,
                "subjectCount": subject_count,
                "subjectNames": Value::Object(normalized),
                "actualStudents": actual_students,
                "startDate": iso_date(&start),
            },
        }),
        200,
    )
}

pub fn route_homework_meta(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("作业系统未初始化", 404, None),
    };
    let store = st.class_store(&class_id);
    match store.get("homework_meta") {
        Some(raw) if !raw.is_empty() => match serde_json::from_str::<Value>(&raw) {
            Ok(v) => Response::json(&v, 200),
            Err(_) => Response::error("作业系统未初始化", 404, None),
        },
        _ => Response::error("作业系统未初始化", 404, None),
    }
}

pub fn route_homework_status(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let store = st.class_store(&class_id);
    let init = store
        .get("homework_meta")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    Response::json(
        &json!({
            "initialized": init,
            "message": if init { "作业系统已初始化" } else { "作业系统未初始化" },
        }),
        200,
    )
}

pub fn route_homework_required(req: &Request, st: &AppState) -> Response {
    let class_id = match class_id_of(req) {
        Ok(c) => c,
        Err(r) => return r,
    };

    let date_text = match req.param("date") {
        Some(d) if !d.is_empty() => d,
        _ => iso_date(&today_local()),
    };
    let date = match parse_date(&date_text) {
        Some(d) => d,
        None => return Response::error("无效的日期，应为 YYYY-MM-DD", 400, None),
    };
    let date_str = iso_date(&date);

    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if let Err(r) = require_class_data(&store) {
        return r;
    }
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, Some("BAD_PASSWORD"));
    }

    let meta = load_meta(&store);
    let required = required_for_date(&store, &date_str);
    let mut submitted = 0usize;
    if !required.is_empty() {
        if let Ok(Some(data)) = hw_load(&store, &creds.password) {
            submitted = count_submitted(&data, &date, &required);
        }
    }

    let student_count = meta.get("studentCount").and_then(|v| v.as_i64()).unwrap_or(0);
    Response::json(
        &json!({
            "class_id": class_id,
            "date": date_str,
            "required": required.iter().map(|n| json!(*n)).collect::<Vec<Value>>(),
            "subjectNames": meta.get("subjectNames").cloned().unwrap_or_else(|| json!({})),
            "studentCount": student_count,
            "submitted": submitted,
            "total": student_count as usize * required.len(),
        }),
        200,
    )
}

pub fn route_homework_get(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }
    let data = match hw_load(&store, &creds.password) {
        Ok(Some(d)) => d,
        Ok(None) => return Response::error("作业数据不存在", 404, None),
        Err(_) => return Response::error("密码错误", 401, None),
    };

    let mut out = hw_date_range(&data);
    out["data"] = json!(data);
    Response::json(&out, 200)
}

pub fn route_homework_raw(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let store = st.class_store(&class_id);
    let raw = store.get("homework_data").unwrap_or_default();
    if raw.is_empty() {
        return Response::error("作业数据不存在", 404, None);
    }
    let meta = match store.get("homework_meta") {
        Some(m) if !m.is_empty() => serde_json::from_str::<Value>(&m).unwrap_or_else(|_| json!({})),
        _ => json!({}),
    };
    let meta_out = if meta.is_object() && meta.as_object().map(|m| m.is_empty()).unwrap_or(false) {
        Value::Null
    } else {
        meta
    };

    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;
    let size = B64.decode(raw.trim()).map(|v| v.len()).unwrap_or(0);

    Response::json(
        &json!({
            "data": raw,
            "meta": meta_out,
            "encoding": "base64",
            "size": size,
        }),
        200,
    )
}

pub fn route_homework_delete(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }
    store.delete("homework_data");
    store.delete("homework_meta");
    Response::json(&json!({"message": "作业数据已删除"}), 200)
}

pub fn route_homework_student(req: &Request, st: &AppState) -> Response {
    // /homework/student/{sid}
    let sid: i64 = match req.path.split("/student/").nth(1) {
        Some(rest) => {
            let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            match digits.parse() {
                Ok(n) => n,
                Err(_) => return Response::error("无效的学生ID", 400, None),
            }
        }
        None => return Response::error("无效的学生ID", 400, None),
    };
    if sid <= 0 {
        return Response::error("无效的学生ID", 400, None);
    }
    let sid = sid as usize;

    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }
    let data = match hw_load(&store, &creds.password) {
        Ok(Some(d)) => d,
        Ok(None) => return Response::error("作业数据不存在", 404, None),
        Err(_) => return Response::error("密码错误", 401, None),
    };

    let total_days = data.len() as i64;
    let from = date_from_of(&data);

    if let Some(date_text) = req.param("date").filter(|d| !d.is_empty()) {
        let parsed = match parse_date(&date_text) {
            Some(d) => d,
            None => return Response::error("无效的日期", 400, None),
        };
        let idx = (parsed - from).num_days();
        if idx < 0 || idx >= total_days || sid >= data[0].len() {
            return Response::error("未找到数据", 404, None);
        }
        return Response::json(
            &json!({
                "date": date_text,
                "studentId": sid,
                "homework": data[idx as usize][sid],
            }),
            200,
        );
    }

    let mut arr = Vec::new();
    for day in 0..total_days {
        if sid >= data[day as usize].len() {
            continue;
        }
        arr.push(json!({
            "date": iso_date(&(from + chrono::Duration::days(day))),
            "homework": data[day as usize][sid],
        }));
    }
    Response::json(&json!({"studentId": sid, "data": arr}), 200)
}

pub fn route_homework_update(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let body: Value = match serde_json::from_str(if req.body.trim().is_empty() { "{}" } else { &req.body }) {
        Ok(v) => v,
        Err(_) => return Response::error("请求体不是合法 JSON", 400, None),
    };
    if !body.is_object() {
        return Response::error("请求体不是合法 JSON", 400, None);
    }

    let sid_raw = body.get("student_id");
    let uid_raw = body
        .get("uid")
        .or_else(|| body.get("uuid"))
        .or_else(|| body.get("card_uid"));
    let target_date = body.get("target_date").and_then(|v| v.as_str()).unwrap_or("");
    let subject_raw = body.get("subject_id");

    if sid_raw.map(|v| v.is_null()).unwrap_or(true) && uid_raw.map(|v| v.is_null()).unwrap_or(true) {
        return Response::error("缺少学生标识: 需要 student_id 或 uid", 400, None);
    }
    if target_date.is_empty() || subject_raw.is_none() {
        return Response::error("缺少必要参数: target_date, subject_id", 400, None);
    }

    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if let Err(r) = require_class_data(&store) {
        return r;
    }
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, Some("BAD_PASSWORD"));
    }

    // 学生：直接给 student_id，或用 uid 反查
    let resolved: usize = if let Some(v) = sid_raw.filter(|v| !v.is_null()) {
        let n = if let Some(n) = v.as_i64() {
            n
        } else if let Some(s) = v.as_str() {
            let s = s.trim();
            if !s.chars().all(|c| c.is_ascii_digit()) || s.is_empty() {
                return Response::error("无效的学生ID", 400, None);
            }
            s.parse::<i64>().unwrap_or(-1)
        } else {
            return Response::error("无效的学生ID", 400, None);
        };
        if n <= 0 {
            return Response::error("无效的学生ID", 400, None);
        }
        n as usize
    } else {
        let uid_value = uid_raw.unwrap();
        let uid = match parse_uid(uid_value) {
            Some(u) => u,
            None => return Response::error("缺少或非法的 uid（1~7 字节）", 400, None),
        };
        let uuids = load_uuids_now(&store);
        let mapped = uuids
            .iter()
            .find(|(_, v)| v.as_slice() == uid.as_slice())
            .map(|(k, _)| *k);
        match mapped {
            Some(n) => n as usize,
            None => return Response::error("该 UID 尚未绑定学号", 404, Some("UID_NOT_BOUND")),
        }
    };

    let subject_id: i64 = if let Some(n) = subject_raw.and_then(|v| v.as_i64()) {
        n
    } else if let Some(s) = subject_raw.and_then(|v| v.as_str()) {
        match s.trim().parse() {
            Ok(n) => n,
            Err(_) => return Response::error("无效的学科ID", 400, None),
        }
    } else {
        return Response::error("无效的学科ID", 400, None);
    };

    // 只允许当天应交的科目
    let required = required_for_date(&store, target_date);
    let req_i64 = required.iter().map(|n| *n as i64).collect::<Vec<i64>>();
    if required.is_empty() || !req_i64.contains(&subject_id) {
        return Response::json(
            &json!({
                "error": "not needed to send",
                "code": "SUBJECT_NOT_REQUIRED",
                "target_date": target_date,
                "subject_id": subject_id,
                "required": required.iter().map(|n| json!(*n)).collect::<Vec<Value>>(),
            }),
            409,
        );
    }

    let mut data = match hw_load(&store, &creds.password) {
        Ok(Some(d)) => d,
        Ok(None) => vec![vec![vec![0u8; 1]; 2]],
        Err(_) => return Response::error("密码错误", 401, None),
    };
    if data.is_empty() || data[0].is_empty() || data[0][0].is_empty() {
        return Response::error("作业数据异常", 500, None);
    }

    let target = match parse_date(target_date) {
        Some(d) => d,
        None => return Response::error("无效的日期", 400, None),
    };
    let from = date_from_of(&data);
    let mut day_index = (target - from).num_days();

    let actual_students = data[0].len();
    let subjects = data[0][0].len();
    if day_index < 0 {
        for _ in 0..(-day_index) {
            data.insert(0, vec![vec![0u8; subjects]; actual_students]);
        }
        day_index = 0;
    } else if day_index as usize >= data.len() {
        let extra = day_index as usize - data.len() + 1;
        for _ in 0..extra {
            data.push(vec![vec![0u8; subjects]; actual_students]);
        }
    }

    let actual_students = data[0].len();
    let subjects = data[0][0].len();
    if resolved == 0 || resolved >= actual_students {
        return Response::error(&format!("无效的学生ID: {}", resolved), 400, None);
    }
    if subject_id < 0 || subject_id as usize >= subjects {
        return Response::error(&format!("无效的学科ID: {}", subject_id), 400, None);
    }

    let was_set = data[day_index as usize][resolved][subject_id as usize] == 1;
    data[day_index as usize][resolved][subject_id as usize] = 1;
    if !hw_save(&store, &data, &creds.password) {
        return Response::error("保存失败", 500, None);
    }

    Response::json(
        &json!({
            "message": "更新成功",
            "student_id": resolved,
            "target_date": target_date,
            "subject_id": subject_id,
            "changed": !was_set,
        }),
        200,
    )
}

/// 读 uuids：学号 → 7 字节
fn load_uuids_now(store: &crate::store::Store) -> Vec<(i64, Vec<u8>)> {
    let raw = store.get("uuids").unwrap_or_default();
    if raw.is_empty() {
        return Vec::new();
    }
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let map = match parsed {
        Value::Object(m) => m,
        _ => return Vec::new(),
    };
    let mut out = Vec::new();
    for (k, v) in map {
        if let Ok(sid) = k.trim().parse::<i64>() {
            if let Some(uid) = parse_uid(&v) {
                out.push((sid, uid));
            }
        }
    }
    out.sort_by_key(|(sid, _)| *sid);
    out
}

pub fn route_homework_day(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let body: Value = match serde_json::from_str(if req.body.trim().is_empty() { "{}" } else { &req.body }) {
        Ok(v) => v,
        Err(_) => return Response::error("请求体不是合法 JSON", 400, None),
    };
    let day_raw = match body.get("day_data") {
        Some(Value::Array(a)) if !a.is_empty() => a.clone(),
        _ => return Response::error("缺少必要参数: day_data", 400, None),
    };
    let target_date = match body.get("target_date").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => iso_date(&today_local()),
    };

    let creds = match Credentials::from(req) {
        Some(c) => c,
        None => return Response::error("需要密码验证", 401, None),
    };
    let store = st.class_store(&class_id);
    if !hash_matches(&store, &creds.hash) {
        return Response::error("密码错误", 401, None);
    }

    let mut day: Vec<Vec<u8>> = Vec::new();
    let mut subjects: Option<usize> = None;
    for row in day_raw.iter() {
        let items = match row {
            Value::Array(a) => a,
            _ => return Response::error("学生数据长度不一致", 400, None),
        };
        if subjects.is_none() {
            subjects = Some(items.len());
        }
        if Some(items.len()) != subjects {
            return Response::error("学生数据长度不一致", 400, None);
        }
        let mut r = Vec::new();
        for x in items {
            r.push(x.as_i64().unwrap_or(0) as u8);
        }
        day.push(r);
    }
    let subjects = subjects.unwrap_or(0);

    let mut data = match hw_load(&store, &creds.password) {
        Ok(Some(d)) => d,
        Ok(None) => Vec::new(),
        Err(_) => return Response::error("密码错误", 401, None),
    };

    if !data.is_empty() {
        let existing_students = data[0].len();
        let existing_subjects = data[0][0].len();
        if existing_students != day.len() {
            return Response::error(
                &format!("学生数量不匹配: 现有 {}, 新数据 {}", existing_students, day.len()),
                400,
                None,
            );
        }
        if existing_subjects != subjects {
            return Response::error(
                &format!("学科数量不匹配: 现有 {}, 新数据 {}", existing_subjects, subjects),
                400,
                None,
            );
        }

        let target = match parse_date(&target_date) {
            Some(d) => d,
            None => return Response::error("无效的日期", 400, None),
        };
        let from = date_from_of(&data);
        let mut day_index = (target - from).num_days();
        let actual_students = data[0].len();
        if day_index < 0 {
            for _ in 0..(-day_index) {
                data.insert(0, vec![vec![0u8; subjects]; actual_students]);
            }
            day_index = 0;
        } else if day_index as usize >= data.len() {
            let extra = day_index as usize - data.len() + 1;
            for _ in 0..extra {
                data.push(vec![vec![0u8; subjects]; actual_students]);
            }
        }
        data[day_index as usize] = day;
    } else {
        data.push(day);
    }

    if !hw_save(&store, &data, &creds.password) {
        return Response::error("保存失败", 500, None);
    }

    let required = match body.get("required_subjects").and_then(|v| v.as_array()) {
        Some(arr) => {
            let mut nums = Vec::new();
            for x in arr {
                if let Some(n) = x.as_i64() {
                    nums.push(n);
                } else if let Some(s) = x.as_str() {
                    if let Ok(n) = s.trim().parse::<i64>() {
                        nums.push(n);
                    }
                }
            }
            set_required_for_date(&store, &target_date, &nums)
        }
        None => required_for_date(&store, &target_date)
            .iter()
            .map(|n| *n as i64)
            .collect(),
    };

    Response::json(
        &json!({
            "message": "添加成功",
            "target_date": target_date,
            "required": required,
        }),
        200,
    )
}
