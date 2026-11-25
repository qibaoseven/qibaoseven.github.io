// ========================================
// OpenStu v0.46 (C++) · API 与业务逻辑
// 与 python/v0.46 的 backend/*.py 行为对齐
// ========================================
#pragma once
#include <string>
#include <vector>
#include <map>
#include <optional>
#include <cmath>
#include <chrono>
#include <ctime>
#include <random>
#include <algorithm>

#include "third_party/json.hpp"
#include "src/crypto.h"
#include "src/store.h"
#include "src/http.h"
#include "src/template_text.h"

namespace osc {

using nlohmann::json;

// ========================================
// 通用工具
// ========================================
struct AppState {
  std::string dataRoot;
};

inline std::string randomBytes(size_t n, std::vector<uint8_t>& out) {
  out.resize(n);
  std::random_device rd;
  for (size_t i = 0; i < n; ++i) out[i] = (uint8_t)(rd() & 0xFF);
  return std::string();
}

inline Response jsonResponse(const json& payload, int status = 200) {
  Response r;
  r.status = status;
  r.contentType = "application/json; charset=utf-8";
  r.body = payload.dump(-1, ' ', false, json::error_handler_t::replace);
  return r;
}

inline Response jsonError(const std::string& msg, int status = 400,
                          const std::string& code = "") {
  json j;
  j["error"] = msg;
  if (!code.empty()) j["code"] = code;
  return jsonResponse(j, status);
}

inline Response textResponse(const std::string& body, int status = 200,
                             const std::string& type = "text/markdown; charset=utf-8") {
  Response r;
  r.status = status;
  r.contentType = type;
  r.body = body;
  return r;
}

// ========================================
// 日期（只用年月日，无时区歧义）
// ========================================
struct Date {
  int y = 1970, m = 1, d = 1;
  bool operator==(const Date& o) const { return y == o.y && m == o.m && d == o.d; }
};

inline long daysFromCivil(int y, int m, int d) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (unsigned)((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1);
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return (long)era * 146097L + (long)doe - 719468L;
}

inline Date civilFromDays(long z) {
  z += 719468;
  const long era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = (unsigned)(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const long y = (long)yoe + era * 400;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  const unsigned d = doy - (153 * mp + 2) / 5 + 1;
  const unsigned m = mp + (mp < 10 ? 3 : -9);
  return Date{(int)(y + (m <= 2)), (int)m, (int)d};
}

inline Date todayLocal() {
  time_t now = time(nullptr);
  struct tm lt;
#ifdef _WIN32
  localtime_s(&lt, &now);
#else
  localtime_r(&now, &lt);
#endif
  return Date{lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday};
}

inline Date addDays(const Date& d, int n) { return civilFromDays(daysFromCivil(d.y, d.m, d.d) + n); }
inline int daysBetween(const Date& a, const Date& b) {
  return (int)(daysFromCivil(a.y, a.m, a.d) - daysFromCivil(b.y, b.m, b.d));
}

inline std::string isoDate(const Date& d) {
  char b[16];
  snprintf(b, sizeof(b), "%04d-%02d-%02d", d.y, d.m, d.d);
  return b;
}

inline bool parseDate(const std::string& text, Date& out) {
  if (text.size() < 10) return false;
  int y, m, d;
  if (sscanf(text.c_str(), "%4d-%2d-%2d", &y, &m, &d) == 3 ||
      sscanf(text.c_str(), "%4d/%2d/%2d", &y, &m, &d) == 3) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    out = Date{y, m, d};
    return true;
  }
  return false;
}

// 上海时间戳，形如 2026/11/25 07:05:03（月日不补零）
inline std::string nowStamp() {
  time_t now = time(nullptr) + 8 * 3600;
  struct tm g;
#ifdef _WIN32
  gmtime_s(&g, &now);
#else
  gmtime_r(&now, &g);
#endif
  char b[32];
  snprintf(b, sizeof(b), "%d/%d/%d %02d:%02d:%02d",
           g.tm_year + 1900, g.tm_mon + 1, g.tm_mday, g.tm_hour, g.tm_min, g.tm_sec);
  return b;
}

// ========================================
// 加密：与 Python 的 JSON: 前缀 + AES-256-GCM 完全一致
// ========================================
inline std::string encryptJson(const json& data, const std::string& password) {
  std::vector<uint8_t> key = deriveKey(password);
  std::string plain = "JSON:" + data.dump(-1, ' ', false, json::error_handler_t::replace);
  std::vector<uint8_t> pt(plain.begin(), plain.end());
  std::vector<uint8_t> iv;
  randomBytes(12, iv);
  return AesGcm().encrypt(key, iv, pt);
}

inline bool decryptJson(const std::string& b64, const std::string& password, json& out) {
  std::vector<uint8_t> key = deriveKey(password);
  std::vector<uint8_t> plain;
  AesGcm gcm;
  if (!gcm.decrypt(key, b64, plain)) return false;
  std::string text(plain.begin(), plain.end());
  if (text.rfind("JSON:", 0) != 0) return false;
  try {
    out = json::parse(text.substr(5));
  } catch (...) {
    return false;
  }
  return true;
}

// ========================================
// 作业数据：位打包二进制（与 Python 魔数/布局一致）
// ========================================
inline constexpr const char* HW_MAGIC = "HWSF";
const int HW_HEADER = 11;

using HwData = std::vector<std::vector<std::vector<int>>>;   // [天][学生][学科]

inline bool hwSave(LocalStore& store, const HwData& data, const std::string& password) {
  if (data.empty()) return false;
  int totalDays = (int)data.size();
  int actualStudents = (int)data[0].size();
  int students = actualStudents - 1;
  int subjects = data[0][0].empty() ? 0 : (int)data[0][0].size();

  Date today = todayLocal();
  Date dateFrom = addDays(today, -(totalDays - 1));
  long daysSince1970 = daysFromCivil(dateFrom.y, dateFrom.m, dateFrom.d);

  std::vector<uint8_t> bits;
  bits.reserve((size_t)totalDays * actualStudents * subjects + 8);
  for (int day = 0; day < totalDays; ++day)
    for (int st = 0; st < actualStudents; ++st)
      for (int sj = 0; sj < subjects; ++sj)
        bits.push_back((uint8_t)(data[day][st][sj] ? 1 : 0));
  while (bits.size() % 8) bits.push_back(0);

  std::vector<uint8_t> bytes;
  for (size_t i = 0; i < bits.size(); i += 8) {
    uint8_t v = 0;
    for (int j = 0; j < 8; ++j) v = (uint8_t)((v << 1) | bits[i + j]);
    bytes.push_back(v);
  }

  std::string plain;
  // 与 Python 一致：外层 encrypt_blob 补一个 HWSF 魔数，buffer 自身再带一个
  plain.append(HW_MAGIC, 4);
  plain.append(HW_MAGIC, 4);
  plain.push_back((char)(students & 0xFF));
  plain.push_back((char)((students >> 8) & 0xFF));
  for (int i = 0; i < 4; ++i) plain.push_back((char)((daysSince1970 >> (8 * i)) & 0xFF));
  plain.push_back((char)(subjects & 0xFF));
  plain.append((const char*)bytes.data(), bytes.size());

  std::vector<uint8_t> key = deriveKey(password);
  std::vector<uint8_t> pt(plain.begin(), plain.end());
  std::vector<uint8_t> iv;
  randomBytes(12, iv);
  std::string b64 = AesGcm().encrypt(key, iv, pt);
  return store.set("homework_data", b64);
}

inline bool hwLoad(LocalStore& store, const std::string& password, HwData& out) {
  auto raw = store.get("homework_data");
  if (!raw || raw->empty()) return false;

  std::vector<uint8_t> key = deriveKey(password);
  std::vector<uint8_t> plain;
  AesGcm gcm;
  if (!gcm.decrypt(key, *raw, plain)) throw std::runtime_error("密码错误");
  // 密文明文 = HWSF(外层) + buffer，buffer 自身以 HWSF 开头
  if (plain.size() < 4 || memcmp(plain.data(), HW_MAGIC, 4) != 0)
    throw std::runtime_error("数据格式错误");
  std::vector<uint8_t> buf(plain.begin() + 4, plain.end());
  if (buf.size() < HW_HEADER || memcmp(buf.data(), HW_MAGIC, 4) != 0)
    throw std::runtime_error("数据格式错误");
  plain.swap(buf);

  int students = plain[4] | (plain[5] << 8);
  long daysSince1970 = 0;
  for (int i = 0; i < 4; ++i) daysSince1970 |= ((long)(uint8_t)plain[6 + i]) << (8 * i);
  int subjects = plain[10];
  int actualStudents = students + 1;

  std::vector<uint8_t> dataBytes(plain.begin() + HW_HEADER, plain.end());
  std::vector<uint8_t> bits;
  bits.reserve(dataBytes.size() * 8);
  for (uint8_t b : dataBytes)
    for (int i = 7; i >= 0; --i) bits.push_back((uint8_t)((b >> i) & 1));

  Date dateFrom = civilFromDays(daysSince1970);
  Date today = todayLocal();
  int totalDays = daysBetween(today, dateFrom) + 1;
  int bitsPerDay = subjects * actualStudents;

  out.clear();
  for (int day = 0; day < totalDays; ++day) {
    size_t start = (size_t)day * bitsPerDay;
    size_t end = start + bitsPerDay;
    if (end > bits.size()) break;
    std::vector<std::vector<int>> dayStudents;
    for (int st = 0; st < actualStudents; ++st) {
      size_t s0 = start + (size_t)st * subjects;
      std::vector<int> row(bits.begin() + s0, bits.begin() + s0 + subjects);
      dayStudents.push_back(row);
    }
    out.push_back(dayStudents);
  }
  return true;
}

inline json hwDateRange(const HwData& data) {
  json r;
  if (data.empty()) {
    r["dateFrom"] = nullptr;
    r["dateTo"] = nullptr;
    r["totalDays"] = 0;
    return r;
  }
  int totalDays = (int)data.size();
  Date today = todayLocal();
  Date from = addDays(today, -(totalDays - 1));
  r["dateFrom"] = isoDate(from);
  r["dateTo"] = isoDate(today);
  r["totalDays"] = totalDays;
  return r;
}

// 当天应交的科目：明文小 JSON，key = homework_required
inline std::map<std::string, std::vector<int>> requiredMap(LocalStore& store) {
  std::map<std::string, std::vector<int>> out;
  auto raw = store.get("homework_required");
  if (!raw || raw->empty()) return out;
  try {
    json j = json::parse(*raw);
    if (!j.is_object()) return out;
    for (auto it = j.begin(); it != j.end(); ++it) {
      if (!it.value().is_array()) continue;
      std::vector<int> v;
      for (auto& x : it.value()) {
        if (x.is_number()) v.push_back(x.get<int>());
        else if (x.is_string()) {
          try { v.push_back(std::stoi(x.get<std::string>())); } catch (...) {}
        }
      }
      out[it.key()] = v;
    }
  } catch (...) {}
  return out;
}

inline std::vector<int> requiredForDate(LocalStore& store, const std::string& date) {
  auto map = requiredMap(store);
  auto it = map.find(date);
  if (it == map.end()) return {};
  return it->second;
}

inline std::vector<int> setRequiredForDate(LocalStore& store, const std::string& date,
                                           const std::vector<int>& subjects) {
  auto map = requiredMap(store);
  std::vector<int> items;
  for (int s : subjects) if (s >= 0 && std::find(items.begin(), items.end(), s) == items.end()) items.push_back(s);
  if (!items.empty()) {
    std::sort(items.begin(), items.end());
    map[date] = items;
  } else {
    map.erase(date);
  }
  json j = json::object();
  for (auto& kv : map) j[kv.first] = kv.second;
  store.set("homework_required", j.dump(-1, ' ', false));
  return items;
}

inline int countSubmitted(const HwData& data, const Date& date, const std::vector<int>& required) {
  if (data.empty() || required.empty()) return 0;
  int totalDays = (int)data.size();
  Date from = addDays(todayLocal(), -(totalDays - 1));
  int idx = daysBetween(date, from);
  if (idx < 0 || idx >= totalDays) return 0;
  int count = 0;
  const auto& day = data[idx];
  for (size_t sid = 1; sid < day.size(); ++sid) {
    const auto& row = day[sid];
    for (int subject : required)
      if (subject >= 0 && subject < (int)row.size() && row[subject] == 1) ++count;
  }
  return count;
}

// ========================================
// UID 归一化（7 字节，左补零）
// ========================================
// UTF-8 字符数（对齐 Python 的 len(str)，不是字节数）
inline long long utf8Length(const std::string& s) {
  long long n = 0;
  for (unsigned char c : s) if ((c & 0xC0) != 0x80) ++n;
  return n;
}

inline bool parseUid(const json& value, std::vector<int>& out7) {
  std::vector<uint8_t> raw;
  auto finish = [&](bool ok) -> bool {
    if (!ok || raw.empty() || raw.size() > 7) return false;
    out7.assign(raw.begin(), raw.end());
    out7.insert(out7.begin(), 7 - (int)out7.size(), 0);
    return true;
  };

  if (value.is_array()) {
    raw.clear();
    for (auto& x : value) {
      if (!x.is_number()) return false;
      int b = x.get<int>();
      if (b < 0 || b > 255) return false;
      raw.push_back((uint8_t)b);
    }
    return finish(true);
  }

  if (value.is_string()) {
    std::string s = value.get<std::string>();
    // 去掉首尾空白
    size_t b = s.find_first_not_of(" \t\r\n");
    if (b == std::string::npos) return false;
    size_t e = s.find_last_not_of(" \t\r\n");
    s = s.substr(b, e - b + 1);

    // 把 '0x' 前缀清掉（只认行首或空白后的 0x）
    std::string compact;
    for (size_t i = 0; i < s.size(); ++i) {
      if ((s[i] == '0') && i + 1 < s.size() && (s[i+1] == 'x' || s[i+1] == 'X') &&
          (i == 0 || isspace((unsigned char)s[i-1]))) {
        ++i;  // 跳过 x
        continue;
      }
      char c = s[i];
      if (c == ' ' || c == '\t' || c == ':' || c == ',' || c == '_' || c == '-') continue;
      compact.push_back(c);
    }
    bool isHex = !compact.empty();
    for (char c : compact) if (!isxdigit((unsigned char)c)) { isHex = false; break; }

    if (isHex && compact.size() <= 14) {
      if (compact.size() % 2) compact = "0" + compact;
      raw.clear();
      for (size_t i = 0; i + 1 < compact.size(); i += 2)
        raw.push_back((uint8_t)strtol(compact.substr(i, 2).c_str(), nullptr, 16));
      return finish(true);
    }

    // 退而求其次当 base64
    std::vector<uint8_t> decoded;
    if (!base64Decode(s, decoded)) return false;
    raw = decoded;
    return finish(true);
  }

  if (value.is_object()) {
    const std::string* hexp = nullptr;
    std::string hexBuf;
    if (value.contains("hex") && value["hex"].is_string()) {
      hexBuf = value["hex"].get<std::string>();
      hexp = &hexBuf;
    }
    if (hexp) {
      std::vector<int> tmp;
      if (!parseUid(json(*hexp), tmp)) return false;
      out7 = tmp;
      return true;
    }
    if (value.contains("bytes")) {
      std::vector<int> tmp;
      if (!parseUid(value["bytes"], tmp)) return false;
      out7 = tmp;
      return true;
    }
    // {0:18, 1:52, ...} 形式：键必须是 0..n-1 连续
    std::vector<std::pair<int,int>> kv;
    for (auto it = value.begin(); it != value.end(); ++it) {
      const std::string& k = it.key();
      bool digits = !k.empty();
      for (char c : k) if (!isdigit((unsigned char)c)) { digits = false; break; }
      if (!digits) return false;
      kv.push_back({atoi(k.c_str()), 0});
      (void)it;
    }
    if (kv.empty()) return false;
    std::sort(kv.begin(), kv.end());
    json arr = json::array();
    for (size_t i = 0; i < kv.size(); ++i) {
      if (kv[i].first != (int)i) return false;
      arr.push_back(value[std::to_string(kv[i].first)]);
    }
    return parseUid(arr, out7);
  }

  return false;
}

}  // namespace osc
