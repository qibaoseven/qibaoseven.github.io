// ========================================
// OpenStu v0.46 (Rust) · 业务基础
//   · 日期、时间戳（本地时区）
//   · 作业位打包（HWSF，与 Python 逐字节一致）
//   · 当天应交清单 required
//   · UID 归一化（7 字节）
// ========================================
use chrono::{Datelike, NaiveDate, Timelike};

pub use crate::localtime::{local_fields, today_local};
use serde_json::{json, Map, Value};

use crate::crypto::{decrypt_plain, encrypt_plain};
use crate::store::Store;

pub const HW_MAGIC: &[u8; 4] = b"HWSF";
pub const HW_HEADER: usize = 11; // HWSF(4)+students(2)+days(4)+subjects(1)

pub type Date = NaiveDate;
/// [天][学生][学科]，学生维包含 0 号机器人哨兵
pub type HwData = Vec<Vec<Vec<u8>>>;

// ---------- 日期（today_local 由 crate::localtime 提供，直接问系统） ----------

pub fn iso_date(d: &Date) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn parse_date(text: &str) -> Option<Date> {
    let t = text.trim();
    if t.len() < 10 {
        return None;
    }
    let sep = if t.as_bytes().get(4) == Some(&b'-') { '-' } else { '/' };
    let fmt = if sep == '-' { "%Y-%m-%d" } else { "%Y/%m/%d" };
    NaiveDate::parse_from_str(&t[0..10], fmt).ok()
}

/// 本地时间戳：2026/11/25 21:48:09（月/日不补零，与 Python 的 strftime 一致）
pub fn now_stamp() -> String {
    let (y, m, d, h, mi, s) = local_fields();
    format!("{}/{}/{} {:02}:{:02}:{:02}", y, m, d, h, mi, s)
}

/// ISO 时间戳（UTC，毫秒固定 .000Z），用于 classes 的 created_at
pub fn utc_stamp() -> String {
    let now = chrono::Utc::now();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

pub fn ms_timestamp() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ---------- 作业数据 ----------
pub fn hw_save(store: &Store, data: &HwData, password: &str) -> bool {
    if data.is_empty() || data[0].is_empty() {
        return false;
    }
    let total_days = data.len();
    let actual_students = data[0].len();
    let students = actual_students - 1;
    let subjects = data[0][0].len();

    let date_from = today_local() - chrono::Duration::days((total_days - 1) as i64);
    let days_since_1970 = date_from.num_days_from_ce() as i64
        - NaiveDate::from_ymd_opt(1970, 1, 1).unwrap().num_days_from_ce() as i64;

    let mut bits: Vec<u8> = Vec::with_capacity(total_days * actual_students * subjects + 8);
    for day in data {
        for student in day {
            for subject in student {
                bits.push(if *subject != 0 { 1 } else { 0 });
            }
        }
    }
    while bits.len() % 8 != 0 {
        bits.push(0);
    }
    let mut bytes = Vec::with_capacity(bits.len() / 8);
    for chunk in bits.chunks(8) {
        let mut v: u8 = 0;
        for b in chunk {
            v = (v << 1) | (*b & 1);
        }
        bytes.push(v);
    }

    // buffer 自身带一个 HWSF 魔数；encrypt_plain 外面再套一个（Python 的双层魔数）
    let mut buffer: Vec<u8> = Vec::new();
    buffer.extend_from_slice(HW_MAGIC);
    buffer.push((students & 0xFF) as u8);
    buffer.push(((students >> 8) & 0xFF) as u8);
    for i in 0..4 {
        buffer.push(((days_since_1970 >> (8 * i)) & 0xFF) as u8);
    }
    buffer.push((subjects & 0xFF) as u8);
    buffer.extend_from_slice(&bytes);

    let mut plain: Vec<u8> = Vec::new();
    plain.extend_from_slice(HW_MAGIC); // 外层
    plain.extend_from_slice(&buffer);

    let enc = encrypt_plain(&plain, password);
    store.set("homework_data", &enc)
}

/// Ok(None) = 没有数据；Err(()) = 密码错或格式非法
pub fn hw_load(store: &Store, password: &str) -> Result<Option<HwData>, ()> {
    let raw = match store.get("homework_data") {
        Some(r) if !r.is_empty() => r,
        _ => return Ok(None),
    };
    let plain = decrypt_plain(&raw, password).ok_or(())?;
    // 剥掉外层魔数
    if plain.len() < 4 || &plain[0..4] != HW_MAGIC {
        return Err(());
    }
    let buf = &plain[4..];
    if buf.len() < HW_HEADER || &buf[0..4] != HW_MAGIC {
        return Err(());
    }
    let students = buf[4] as usize | ((buf[5] as usize) << 8);
    let mut days_since_1970: i64 = 0;
    for i in 0..4 {
        days_since_1970 |= (buf[6 + i] as i64) << (8 * i);
    }
    let subjects = buf[10] as usize;
    let actual_students = students + 1;

    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
    let date_from = epoch + chrono::Duration::days(days_since_1970);
    let today = today_local();
    let total_days = ((today - date_from).num_days() + 1).max(0) as usize;
    let bits_per_day = subjects * actual_students;
    if bits_per_day == 0 {
        return Ok(Some(Vec::new()));
    }

    let data_bytes = &buf[HW_HEADER..];
    let mut out: HwData = Vec::new();
    for day in 0..total_days {
        let start_bit = day * bits_per_day;
        let end_bit = start_bit + bits_per_day;
        if end_bit > data_bytes.len() * 8 {
            break;
        }
        let mut day_students: Vec<Vec<u8>> = Vec::with_capacity(actual_students);
        for student in 0..actual_students {
            let s0 = start_bit + student * subjects;
            let mut row = Vec::with_capacity(subjects);
            for k in 0..subjects {
                let bit = s0 + k;
                let byte = data_bytes[bit / 8];
                row.push((byte >> (7 - (bit % 8))) & 1);
            }
            day_students.push(row);
        }
        out.push(day_students);
    }
    Ok(Some(out))
}

pub fn hw_date_range(data: &HwData) -> Value {
    if data.is_empty() {
        return json!({"dateFrom": null, "dateTo": null, "totalDays": 0});
    }
    let total_days = data.len() as i64;
    let today = today_local();
    let from = today - chrono::Duration::days(total_days - 1);
    json!({
        "dateFrom": iso_date(&from),
        "dateTo": iso_date(&today),
        "totalDays": total_days,
    })
}

/// 从 dateFrom 起算的日期轴
pub fn date_from_of(data: &HwData) -> Date {
    today_local() - chrono::Duration::days(data.len() as i64 - 1)
}

// ---------- 当天应交清单 ----------
pub fn required_map(store: &Store) -> Map<String, Value> {
    let mut out = Map::new();
    let raw = match store.get("homework_required") {
        Some(r) if !r.is_empty() => r,
        _ => return out,
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return out,
    };
    if let Value::Object(map) = parsed {
        for (k, v) in map {
            if let Value::Array(items) = v {
                let mut nums = Vec::new();
                for it in items {
                    if let Some(n) = it.as_i64() {
                        nums.push(n);
                    } else if let Some(s) = it.as_str() {
                        if let Ok(n) = s.trim().parse::<i64>() {
                            nums.push(n);
                        }
                    }
                }
                out.insert(k, Value::Array(nums.iter().map(|n| json!(*n)).collect()));
            }
        }
    }
    out
}

pub fn required_for_date(store: &Store, date: &str) -> Vec<usize> {
    let map = required_map(store);
    map.get(date)
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_i64())
                .filter(|n| *n >= 0)
                .map(|n| n as usize)
                .collect()
        })
        .unwrap_or_default()
}

pub fn set_required_for_date(store: &Store, date: &str, subjects: &[i64]) -> Vec<i64> {
    let mut map = required_map(store);
    let mut items: Vec<i64> = Vec::new();
    for s in subjects {
        if *s >= 0 && !items.contains(s) {
            items.push(*s);
        }
    }
    if items.is_empty() {
        map.remove(date);
    } else {
        items.sort_unstable();
        map.insert(
            date.to_string(),
            Value::Array(items.iter().map(|n| json!(*n)).collect()),
        );
    }
    store.set(
        "homework_required",
        &serde_json::to_string(&Value::Object(map)).unwrap_or_default(),
    );
    items
}

pub fn count_submitted(data: &HwData, date: &Date, required: &[usize]) -> usize {
    if data.is_empty() || required.is_empty() {
        return 0;
    }
    let from = date_from_of(data);
    let idx = (*date - from).num_days();
    if idx < 0 || idx as usize >= data.len() {
        return 0;
    }
    let day = &data[idx as usize];
    let mut count = 0;
    for row in day.iter().skip(1) {
        for s in required {
            if *s < row.len() && row[*s] == 1 {
                count += 1;
            }
        }
    }
    count
}

// ---------- 作业种类（第四维，侧车存储） ----------
// 位压缩的主数据仍是 [天][学生][学科] 一 bit，不动老格式；
// "种类"单独存在 homework_types（明文 JSON），形如：
//   { "2026-11-27": { "23": { "0": [0,2] } } }
// 含义：某天、某学生、某学科，已经交过的种类下标。
// 学科 bit 的语义：该科所有种类都交齐了才置 1（没配种类时就等于旧行为）。

pub fn types_of(meta: &Value, subject: usize) -> Vec<String> {
    meta.get("types")
        .and_then(|t| t.get(subject.to_string()))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub fn load_type_sets(store: &Store) -> Value {
    let raw = store.get("homework_types").unwrap_or_default();
    if raw.trim().is_empty() {
        return json!({});
    }
    serde_json::from_str(&raw).unwrap_or_else(|_| json!({}))
}

pub fn save_type_sets(store: &Store, value: &Value) {
    store.set(
        "homework_types",
        &serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string()),
    );
}

/// 取某天某生某科已交种类下标
pub fn type_set_for(root: &Value, date: &str, sid: usize, subject: usize) -> Vec<usize> {
    root.get(date)
        .and_then(|d| d.get(sid.to_string()))
        .and_then(|s| s.get(subject.to_string()))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_i64()).filter(|n| *n >= 0).map(|n| n as usize).collect())
        .unwrap_or_default()
}

/// 把种类下标写进侧车（合并）
pub fn type_mark(root: &mut Value, date: &str, sid: usize, subject: usize, idxs: &[usize]) {
    let mut list: Vec<usize> = type_set_for(root, date, sid, subject);
    for i in idxs {
        if !list.contains(i) {
            list.push(*i);
        }
    }
    list.sort_unstable();

    if !root.is_object() {
        *root = json!({});
    }
    let day = root
        .as_object_mut()
        .unwrap()
        .entry(date.to_string())
        .or_insert_with(|| json!({}));
    if !day.is_object() {
        *day = json!({});
    }
    let stu = day
        .as_object_mut()
        .unwrap()
        .entry(sid.to_string())
        .or_insert_with(|| json!({}));
    if !stu.is_object() {
        *stu = json!({});
    }
    stu.as_object_mut().unwrap().insert(
        subject.to_string(),
        Value::Array(list.iter().map(|n| json!(*n)).collect()),
    );
}

/// 某天某科「一共有多少条要交」（学生数 × 该科种类数，未配种类算 1）
pub fn required_total(meta: &Value, student_count: usize, required: &[usize]) -> usize {
    let mut per_student = 0usize;
    for s in required {
        let n = types_of(meta, *s).len();
        per_student += if n == 0 { 1 } else { n };
    }
    student_count * per_student
}

/// 已交条数（种类级；没配种类按学科 bit 算 1）
pub fn count_submitted_typed(
    data: &HwData,
    meta: &Value,
    type_sets: &Value,
    date: &Date,
    required: &[usize],
) -> usize {
    if data.is_empty() || required.is_empty() {
        return 0;
    }
    let from = date_from_of(data);
    let idx = (*date - from).num_days();
    if idx < 0 || idx as usize >= data.len() {
        return 0;
    }
    let date_key = iso_date(date);
    let day = &data[idx as usize];
    let mut count = 0;
    for sid in 1..day.len() {
        for s in required {
            let types = types_of(meta, *s);
            if types.is_empty() {
                if *s < day[sid].len() && day[sid][*s] == 1 {
                    count += 1;
                }
            } else {
                count += type_set_for(type_sets, &date_key, sid, *s)
                    .into_iter()
                    .filter(|i| *i < types.len())
                    .count();
            }
        }
    }
    count
}

// ---------- 登记一次提交（学科 + 可选种类） ----------
// 供 /homework/update 与 /uuids/add 共用：绑卡时顺带登记，逻辑只写一遍。
pub fn hw_submit(
    store: &Store,
    password: &str,
    sid: usize,
    subject_id: usize,
    type_id: Option<usize>,
    date_str: &str,
) -> Result<(bool, Vec<usize>), String> {
    let mut data = match hw_load(store, password) {
        Ok(Some(d)) => d,
        Ok(None) => vec![vec![vec![0u8; 1]; 2]],
        Err(_) => return Err("密码错误".to_string()),
    };
    if data.is_empty() || data[0].is_empty() || data[0][0].is_empty() {
        return Err("作业数据异常".to_string());
    }

    let target = match parse_date(date_str) {
        Some(d) => d,
        None => return Err("无效的日期".to_string()),
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
    if sid == 0 || sid >= actual_students {
        return Err(format!("无效的学生ID: {}", sid));
    }
    if subject_id >= subjects {
        return Err(format!("无效的学科ID: {}", subject_id));
    }

    let was_set = data[day_index as usize][sid][subject_id] == 1;
    let meta = match store.get("homework_meta") {
        Some(raw) if !raw.is_empty() => serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({})),
        _ => json!({}),
    };
    let subject_types = types_of(&meta, subject_id);
    let mut type_sets = load_type_sets(store);
    let mut changed = !was_set;

    if subject_types.is_empty() {
        data[day_index as usize][sid][subject_id] = 1;
    } else {
        let all: Vec<usize> = (0..subject_types.len()).collect();
        let picked: Vec<usize> = match type_id {
            Some(t) => {
                if t >= subject_types.len() {
                    return Err("作业种类超出范围".to_string());
                }
                vec![t]
            }
            None => all.clone(),
        };
        let before = type_set_for(&type_sets, date_str, sid, subject_id);
        type_mark(&mut type_sets, date_str, sid, subject_id, &picked);
        let after = type_set_for(&type_sets, date_str, sid, subject_id);
        changed = after.len() > before.len() || !was_set;
        let done_all = all.iter().all(|i| after.contains(i));
        data[day_index as usize][sid][subject_id] = if done_all { 1 } else { 0 };
    }

    if !hw_save(store, &data, password) {
        return Err("保存失败".to_string());
    }
    save_type_sets(store, &type_sets);

    Ok((changed, type_set_for(&type_sets, date_str, sid, subject_id)))
}

// ---------- UID ----------
/// UTF-8 字符数（对齐 Python 的 len(str)）
pub fn utf8_len(s: &str) -> usize {
    s.chars().count()
}

/// 各种写法 → 定长 7 字节（左补 0）
pub fn parse_uid(value: &Value) -> Option<Vec<u8>> {
    fn finish(raw: Vec<u8>) -> Option<Vec<u8>> {
        if raw.is_empty() || raw.len() > 7 {
            return None;
        }
        let pad = 7 - raw.len();
        let mut out = vec![0u8; pad];
        out.extend(raw);
        Some(out)
    }

    match value {
        Value::Array(items) => {
            let mut raw = Vec::new();
            for it in items {
                let n = it.as_i64()?;
                if !(0..=255).contains(&n) {
                    return None;
                }
                raw.push(n as u8);
            }
            finish(raw)
        }
        Value::Object(map) => {
            if let Some(hex) = map.get("hex") {
                return parse_uid(hex);
            }
            if let Some(bytes) = map.get("bytes") {
                return parse_uid(bytes);
            }
            // {0:18, 1:52, ...}
            let mut numbered: Vec<(i64, Value)> = Vec::new();
            for (k, v) in map {
                let n: i64 = k.trim().parse().ok()?;
                numbered.push((n, v.clone()));
            }
            if numbered.is_empty() {
                return None;
            }
            numbered.sort_by_key(|(n, _)| *n);
            let mut arr = Vec::new();
            for (i, (n, v)) in numbered.iter().enumerate() {
                if *n != i as i64 {
                    return None;
                }
                arr.push(v.clone());
            }
            parse_uid(&Value::Array(arr))
        }
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                return None;
            }
            // 去掉 '0x' 前缀（行首或空白后的 0x）
            let mut compact = String::new();
            let chars: Vec<char> = t.chars().collect();
            let mut i = 0;
            while i < chars.len() {
                let c = chars[i];
                if c == '0' && i + 1 < chars.len() && (chars[i + 1] == 'x' || chars[i + 1] == 'X')
                    && (i == 0 || chars[i - 1].is_whitespace())
                {
                    i += 2;
                    continue;
                }
                if c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == ':' || c == ',' || c == '_' || c == '-' {
                    i += 1;
                    continue;
                }
                compact.push(c);
                i += 1;
            }
            if !compact.is_empty()
                && compact.len() <= 14
                && compact.chars().all(|c| c.is_ascii_hexdigit())
            {
                let mut hex = compact.clone();
                if hex.len() % 2 == 1 {
                    hex.insert(0, '0');
                }
                let mut raw = Vec::new();
                for k in (0..hex.len()).step_by(2) {
                    raw.push(u8::from_str_radix(&hex[k..k + 2], 16).ok()?);
                }
                return finish(raw);
            }
            // 退而求其次当 base64
            use base64::engine::general_purpose::STANDARD as B64;
            use base64::Engine;
            let decoded = B64.decode(t).ok()?;
            finish(decoded)
        }
        Value::Number(n) => {
            let v = n.as_i64()?;
            if v < 0 || v > 255 {
                return None;
            }
            finish(vec![v as u8])
        }
        _ => None,
    }
}
