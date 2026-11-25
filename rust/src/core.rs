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
