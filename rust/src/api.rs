// 路由分发：顺序严格照搬 Python 版（includes 顺序匹配）
use serde_json::json;

use crate::app::AppState;
use crate::http::{Request, Response};
use crate::routes_basic::*;
use crate::routes_homework::*;
use crate::routes_journal::*;

fn has(path: &str, needle: &str) -> bool {
    path.contains(needle)
}

pub fn handle_api(req: &Request, st: &AppState) -> Response {
    let p = req.path.as_str();
    let m = req.method.as_str();

    if m == "OPTIONS" {
        return Response::empty(204);
    }

    if m == "GET" && has(p, "/api/classes") {
        return route_classes_list(req, st);
    }
    if m == "POST" && has(p, "/api/classes/import") {
        return Response::error(
            "Rust 版暂不支持从 JsonBin 导入，请用导出的 JSON 手动创建班级",
            400,
            None,
        );
    }
    if m == "POST" && has(p, "/api/classes/create") {
        return route_class_create(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/students") {
        return route_class_get(req, st, true);
    }
    if m == "GET"
        && has(p, "/api/class/")
        && !has(p, "/homework")
        && !has(p, "/journal")
        && !has(p, "/students")
        && !has(p, "/uuids")
    {
        return route_class_get(req, st, false);
    }
    if m == "POST"
        && has(p, "/api/class/")
        && !has(p, "/homework")
        && !has(p, "/journal")
        && !has(p, "/students")
        && !has(p, "/uuids")
    {
        return route_class_post(req, st);
    }
    if m == "GET" && has(p, "/api/template") {
        return route_template();
    }

    // UID
    if m == "GET" && has(p, "/api/class/") && has(p, "/uuids") {
        return route_uuids_get(req, st);
    }
    if m == "POST" && has(p, "/api/class/") && has(p, "/uuids/add") {
        return route_uuids_add(req, st);
    }
    if m == "POST" && has(p, "/api/class/") && has(p, "/uuids") {
        return route_uuids_post(req, st);
    }

    // 作业
    if m == "POST" && has(p, "/api/class/") && has(p, "/homework/init") {
        return route_homework_init(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/homework/meta") {
        return route_homework_meta(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/homework/status") {
        return route_homework_status(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/homework/required") {
        return route_homework_required(req, st);
    }
    if m == "GET"
        && has(p, "/api/class/")
        && has(p, "/homework")
        && !has(p, "/meta")
        && !has(p, "/status")
        && !has(p, "/required")
        && !has(p, "/student")
        && !has(p, "/raw")
    {
        return route_homework_get(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/homework/raw") && !has(p, "/download") {
        return route_homework_raw(req, st);
    }
    if m == "DELETE" && has(p, "/api/class/") && has(p, "/homework") {
        return route_homework_delete(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/homework/student/") {
        return route_homework_student(req, st);
    }
    if m == "POST" && has(p, "/api/class/") && has(p, "/homework/update") {
        return route_homework_update(req, st);
    }
    if m == "POST" && has(p, "/api/class/") && has(p, "/homework/day") {
        return route_homework_day(req, st);
    }

    // 历程
    if m == "GET" && has(p, "/api/class/") && has(p, "/journal/") {
        return route_journal_one(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/journals") {
        return route_journals_batch(req, st);
    }
    if m == "POST" && has(p, "/api/class/") && has(p, "/journal") {
        return route_journal_append(req, st);
    }
    if m == "GET" && has(p, "/api/class/") && has(p, "/journal-export") {
        return route_journal_export(req, st);
    }

    Response::json(&json!({"error": "Not Found", "path": p}), 404)
}
