// 学生历程
use serde_json::{json, Map, Value};

use crate::app::*;
use crate::core::{iso_date, now_stamp, today_local, utf8_len};
use crate::http::{Request, Response};

fn sid_from_path(path: &str) -> Option<String> {
    let rest = path.split("/journal/").nth(1)?;
    let sid: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if valid_student_id(&sid) {
        Some(sid)
    } else {
        None
    }
}

pub fn route_journal_one(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let sid = match sid_from_path(&req.path) {
        Some(s) => s,
        None => return Response::error("无效的学号", 400, None),
    };
    let store = st.class_store(&class_id);
    let text = read_journal(&store, &sid);
    Response::json(
        &json!({
            "student_id": sid,
            "journal": text,
            "length": utf8_len(&text),
        }),
        200,
    )
}

fn split_ids(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn route_journals_batch(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let ids = split_ids(&req.param("ids").unwrap_or_default());
    if ids.len() > 200 {
        return Response::error("一次最多查询 200 名学生", 400, None);
    }
    let store = st.class_store(&class_id);
    let mut journals = Map::new();
    for raw in ids {
        if !valid_student_id(&raw) {
            continue;
        }
        let text = read_journal(&store, &raw);
        journals.insert(
            raw.clone(),
            json!({"journal": text, "length": utf8_len(&text)}),
        );
    }
    Response::json(&json!({"journals": Value::Object(journals)}), 200)
}

pub fn route_journal_append(req: &Request, st: &AppState) -> Response {
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

    let sid = body.get("student_id").and_then(|v| v.as_str()).unwrap_or("");
    if !valid_student_id(sid) {
        return Response::error("缺少或非法的 student_id", 400, None);
    }
    let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
    if content.trim().is_empty() {
        return Response::error("content 不能为空", 400, None);
    }

    let op_name = body.get("operator_name").and_then(|v| v.as_str()).unwrap_or("");
    let op = body.get("operator").and_then(|v| v.as_str()).unwrap_or("");
    let op_role = body.get("operator_role").and_then(|v| v.as_str()).unwrap_or("");

    let store = st.class_store(&class_id);
    let old = read_journal(&store, sid);
    if utf8_len(&old) + utf8_len(content) > JOURNAL_MAX_LEN {
        return Response::error(
            &format!("历程内容超出上限（{} 字符）", JOURNAL_MAX_LEN),
            400,
            None,
        );
    }

    let who = if !op_name.is_empty() {
        op_name.to_string()
    } else if !op.is_empty() {
        op.to_string()
    } else {
        "未知".to_string()
    };
    let tag = if op_role == "user" {
        String::new()
    } else {
        format!("〔{}〕", who)
    };
    let block = format!("[{}]{} {}\n", now_stamp(), tag, content);
    let next = format!("{}{}", old, block);
    store.set(&journal_key(sid), &next);

    Response::json(
        &json!({
            "message": "已追加",
            "student_id": sid,
            "appended": block,
            "journal": next,
            "length": utf8_len(&next),
        }),
        200,
    )
}

pub fn route_journal_export(req: &Request, st: &AppState) -> Response {
    let class_id = match get_class_id(&req.path) {
        Some(c) => c,
        None => return Response::error("class not right", 401, Some("CLASS_NOT_RIGHT")),
    };
    let ids = split_ids(&req.param("ids").unwrap_or_default());
    let names = split_ids(&req.param("names").unwrap_or_default());

    let store = st.class_store(&class_id);
    let mut out = String::new();
    out.push_str("========================================\n");
    out.push_str("学生历程导出\n");
    out.push_str(&format!("导出时间：{}\n", now_stamp()));
    out.push_str(&format!("学生人数：{}\n", ids.len()));
    out.push_str("========================================\n\n");

    for (i, sid) in ids.iter().enumerate() {
        if !valid_student_id(sid) {
            continue;
        }
        let name = names.get(i).cloned().unwrap_or_default();
        let text = read_journal(&store, sid);
        let display = if name.is_empty() { "未知".to_string() } else { name };
        out.push_str(&format!(
            "---------- {}（学号 {}） ----------\n",
            display, sid
        ));
        if text.trim().is_empty() {
            out.push_str("（暂无历程记录）\n");
        } else {
            out.push_str(text.trim_end_matches('\n'));
            out.push('\n');
        }
        out.push('\n');
    }

    let today = today_local();
    let filename = format!(
        "journals_{:04}-{:02}-{:02}.txt",
        chrono::Datelike::year(&today),
        chrono::Datelike::month(&today),
        chrono::Datelike::day(&today)
    );
    let _ = iso_date(&today);
    Response::text(out.into_bytes(), 200, "text/plain; charset=utf-8").with_header(
        "Content-Disposition",
        &format!("attachment; filename=\"{}\"", filename),
    )
}
