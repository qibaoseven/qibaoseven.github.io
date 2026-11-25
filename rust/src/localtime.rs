// 本地时间：直接问操作系统，不经过 chrono 的时区数据库
//   · Windows：GetLocalTime（kernel32）
//   · Unix：localtime_r
// 这样即便系统时区信息缺失也不会 panic（chrono 的 Local 在那种情况下会 panic）
use chrono::{Datelike, NaiveDate, NaiveDateTime, Timelike};

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Default)]
struct SystemTime {
    year: u16,
    month: u16,
    day_of_week: u16,
    day: u16,
    hour: u16,
    minute: u16,
    second: u16,
    milliseconds: u16,
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn GetLocalTime(st: *mut SystemTime);
}

#[cfg(not(target_os = "windows"))]
#[repr(C)]
struct Tm {
    tm_sec: i32,
    tm_min: i32,
    tm_hour: i32,
    tm_mday: i32,
    tm_mon: i32,
    tm_year: i32,
    tm_wday: i32,
    tm_yday: i32,
    tm_isdst: i32,
    tm_gmtoff: i64,
    tm_zone: *const i8,
}

#[cfg(not(target_os = "windows"))]
extern "C" {
    fn localtime_r(timep: *const i64, result: *mut Tm) -> *mut Tm;
}

/// (年, 月, 日, 时, 分, 秒)
pub fn local_fields() -> (i32, u32, u32, u32, u32, u32) {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut st = SystemTime::default();
        GetLocalTime(&mut st);
        if st.year == 0 {
            return utc_fields();
        }
        return (
            st.year as i32,
            st.month as u32,
            st.day as u32,
            st.hour as u32,
            st.minute as u32,
            st.second as u32,
        );
    }
    #[cfg(not(target_os = "windows"))]
    unsafe {
        let now: i64 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let mut tm = Tm {
            tm_sec: 0,
            tm_min: 0,
            tm_hour: 0,
            tm_mday: 0,
            tm_mon: 0,
            tm_year: 0,
            tm_wday: 0,
            tm_yday: 0,
            tm_isdst: 0,
            tm_gmtoff: 0,
            tm_zone: std::ptr::null(),
        };
        if localtime_r(&now, &mut tm).is_null() {
            return utc_fields();
        }
        return (
            tm.tm_year + 1900,
            (tm.tm_mon + 1) as u32,
            tm.tm_mday as u32,
            tm.tm_hour as u32,
            tm.tm_min as u32,
            tm.tm_sec as u32,
        );
    }
}

fn utc_fields() -> (i32, u32, u32, u32, u32, u32) {
    let now = chrono::Utc::now();
    (
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
    )
}

pub fn now_local() -> NaiveDateTime {
    let (y, m, d, h, mi, s) = local_fields();
    NaiveDate::from_ymd_opt(y, m as u32, d)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap())
        .and_hms_opt(h, mi, s)
        .unwrap_or_else(|| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap().and_hms_opt(0, 0, 0).unwrap())
}

pub fn today_local() -> NaiveDate {
    now_local().date()
}
