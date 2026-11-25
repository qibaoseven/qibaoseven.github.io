// 公共：状态、班级/主桶、token、学生抽取、历程读写
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};

use crate::crypto;
use crate::store::Store;

pub struct AppState {
    pub data_root: PathBuf,
}

impl AppState {
    pub fn new(root: impl AsRef<Path>) -> AppState {
        AppState {
            data_root: root.as_ref().to_path_buf(),
        }
    }

    pub fn class_store(&self, class_id: &str) -> Store {
        Store::new(&self.data_root, &format!("class-{}", class_id))
    }

    pub fn main_store(&self) -> Store {
        Store::new(&self.data_root, "studentos-main")
    }
}

/// 从路径里抠出 class_1234567890
pub fn get_class_id(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut i = 0;
    while i + 6 < bytes.len() {
        if &bytes[i..i + 6] == b"class_" {
            let mut j = i + 6;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > i + 6 {
                return Some(path[i..j].to_string());
            }
        }
        i += 1;
    }
    None
}

// ---------- 班级索引 ----------
pub fn load_classes(st: &AppState) -> Vec<Value> {
    match st.main_store().get("classes") {
        Some(raw) if !raw.is_empty() => match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Array(items)) => items,
            _ => Vec::new(),
        },
        _ => Vec::new(),
    }
}

pub fn save_classes(st: &AppState, classes: &[Value]) -> bool {
    st.main_store()
        .set("classes", &serde_json::to_string(&classes).unwrap_or_default())
}

pub fn load_tokens(st: &AppState) -> Value {
    let empty = || json!({"tokens": [], "used": []});
    match st.main_store().get("tokens") {
        Some(raw) if !raw.is_empty() => match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Object(mut map)) => {
                if !map.contains_key("tokens") {
                    map.insert("tokens".into(), json!([]));
                }
                if !map.contains_key("used") {
                    map.insert("used".into(), json!([]));
                }
                Value::Object(map)
            }
            _ => empty(),
        },
        _ => empty(),
    }
}

/// 与 Python 一致：登记的 token 用掉一个；已用过的拒绝；没登记过的放行
pub fn verify_token(st: &AppState, token: &str) -> bool {
    let mut tokens = load_tokens(st);
    let mut used_list: Vec<Value> = Vec::new();
    let mut found = false;

    if let Some(Value::Array(list)) = tokens.get("tokens") {
        for item in list {
            if item.as_str() == Some(token) && !found {
                found = true;
                continue;
            }
            used_list.push(item.clone());
        }
    }
    if found {
        tokens["tokens"] = Value::Array(used_list);
        if let Some(Value::Array(used)) = tokens.get_mut("used") {
            used.push(json!(token));
        }
        st.main_store()
            .set("tokens", &serde_json::to_string(&tokens).unwrap_or_default());
        return true;
    }
    if let Some(Value::Array(used)) = tokens.get("used") {
        for u in used {
            if u.as_str() == Some(token) {
                return false;
            }
        }
    }
    true
}

// ---------- 学生抽取 ----------
pub fn extract_students(data: &Value, include_teachers: bool) -> Value {
    let mut out = Map::new();
    let scores = match data.get("scores") {
        Some(Value::Object(m)) => m.clone(),
        _ => return Value::Object(out),
    };
    for (sid, row) in scores {
        if sid == "0" {
            continue;
        }
        let name = match &row {
            Value::Array(items) => items.first().and_then(|v| v.as_str()).map(|s| s.to_string()),
            Value::Object(m) => m.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
            _ => None,
        };
        match name {
            Some(n) if !n.is_empty() => {
                out.insert(sid, json!(n));
            }
            _ => {}
        }
    }

    if !include_teachers {
        if let Some(Value::Object(users)) = data.get("users") {
            for (_k, u) in users {
                let role = u.get("role").and_then(|v| v.as_str()).unwrap_or("user");
                if role == "user" {
                    continue;
                }
                let sid = match u.get("student_id") {
                    Some(Value::String(s)) => s.clone(),
                    Some(Value::Number(n)) => n.to_string(),
                    _ => continue,
                };
                out.remove(&sid);
            }
        }
    }
    Value::Object(out)
}

// ---------- 历程 ----------
pub const JOURNAL_MAX_LEN: usize = 200000;

pub fn valid_student_id(sid: &str) -> bool {
    if sid.is_empty() || sid.len() > 32 {
        return false;
    }
    sid.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn journal_key(sid: &str) -> String {
    format!("journal_{}", sid)
}

pub fn read_journal(store: &Store, sid: &str) -> String {
    store.get(&journal_key(sid)).unwrap_or_default()
}

// ---------- 密码校验 ----------
pub struct Credentials {
    pub password: String,
    pub hash: String,
}

impl Credentials {
    pub fn from(req: &crate::http::Request) -> Option<Credentials> {
        let password = req.header("x-password")?.to_string();
        let hash = req.header("x-password-hash")?.to_string();
        if password.is_empty() || hash.is_empty() {
            return None;
        }
        Some(Credentials { password, hash })
    }
}

/// 校验班级密码哈希；stored 为空时视为通过（与 Python 一致）
pub fn hash_matches(store: &Store, hash: &str) -> bool {
    match store.get("password_hash") {
        Some(stored) if !stored.is_empty() => stored == hash,
        _ => true,
    }
}

#[allow(dead_code)]
pub fn hash_password(password: &str) -> String {
    crypto::sha256_hex(password)
}
