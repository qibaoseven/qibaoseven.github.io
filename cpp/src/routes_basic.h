// ========================================
// OpenStu v0.46 (C++) · 路由分发与各接口实现
// 路径匹配顺序严格照搬 Python 版（includes 顺序匹配）
// ========================================
#pragma once
#include <set>
#include <string>
#include <regex>
#include "src/core.h"

namespace osc {

inline std::string getClassId(const std::string& path) {
  std::smatch m;
  std::regex re("class_\\d+");
  if (std::regex_search(path, m, re)) return m.str(0);
  return std::string();
}

inline LocalStore classStore(const AppState& st, const std::string& classId) {
  return LocalStore(st.dataRoot, "class-" + classId);
}

inline LocalStore mainStore(const AppState& st) {
  return LocalStore(st.dataRoot, "studentos-main");
}

// ---------- 班级索引 ----------
inline json loadClasses(const AppState& st) {
  auto raw = mainStore(st).get("classes");
  if (!raw || raw->empty()) return json::array();
  try {
    json j = json::parse(*raw);
    return j.is_array() ? j : json::array();
  } catch (...) { return json::array(); }
}

inline json loadTokens(const AppState& st) {
  auto raw = mainStore(st).get("tokens");
  if (!raw || raw->empty()) return json{ {"tokens", json::array()}, {"used", json::array()} };
  try {
    json j = json::parse(*raw);
    if (!j.is_object()) return json{ {"tokens", json::array()}, {"used", json::array()} };
    if (!j.contains("tokens")) j["tokens"] = json::array();
    if (!j.contains("used")) j["used"] = json::array();
    return j;
  } catch (...) { return json{ {"tokens", json::array()}, {"used", json::array()} }; }
}

inline bool verifyToken(const AppState& st, const std::string& token) {
  json tokens = loadTokens(st);
  json list = tokens["tokens"];
  for (size_t i = 0; i < list.size(); ++i) {
    if (list[i].is_string() && list[i].get<std::string>() == token) {
      list.erase(list.begin() + (long)i);
      tokens["tokens"] = list;
      tokens["used"].push_back(token);
      mainStore(st).set("tokens", tokens.dump(-1, ' ', false));
      return true;
    }
  }
  for (auto& u : tokens["used"]) if (u.is_string() && u.get<std::string>() == token) return false;
  return true;   // 未登记的 token 也放行（与 Python 一致）
}

// ---------- 学生抽取 ----------
inline json extractStudents(const json& data, bool includeTeachers) {
  json out = json::object();
  if (!data.is_object()) return out;
  json scores = data.value("scores", json::object());
  if (!scores.is_object()) return out;
  for (auto it = scores.begin(); it != scores.end(); ++it) {
    std::string sid = it.key();
    if (sid == "0") continue;
    std::string name;
    const json& row = it.value();
    if (row.is_array() && !row.empty() && row[0].is_string()) name = row[0].get<std::string>();
    else if (row.is_object() && row.contains("name") && row["name"].is_string())
      name = row["name"].get<std::string>();
    if (name.empty()) continue;
    out[sid] = name;
  }
  if (!includeTeachers) {
    json users = data.value("users", json::object());
    if (users.is_object()) {
      for (auto it = users.begin(); it != users.end(); ++it) {
        const json& u = it.value();
        if (!u.is_object()) continue;
        if (u.value("role", "user") == "user") continue;
        if (!u.contains("student_id") || u["student_id"].is_null()) continue;
        std::string sid = u["student_id"].is_string() ? u["student_id"].get<std::string>()
                                                      : std::to_string(u["student_id"].get<long long>());
        out.erase(sid);
      }
    }
  }
  return out;
}

// ---------- 历程 ----------
inline bool validStudentId(const std::string& sid) {
  if (sid.empty() || sid.size() > 32) return false;
  for (char c : sid)
    if (!(isalnum((unsigned char)c) || c == '_' || c == '-')) return false;
  return true;
}

inline std::string journalKey(const std::string& sid) { return "journal_" + sid; }

inline std::string readJournal(LocalStore& store, const std::string& sid) {
  auto raw = store.get(journalKey(sid));
  return raw ? *raw : std::string();
}

const size_t JOURNAL_MAX_LEN = 200000;

Response handleApi(const Request& req, const AppState& st, bool& matched);

// ========================================
// 各路由
// ========================================
inline Response routeClassesList(const Request&, const AppState& st) {
  json arr = loadClasses(st);
  json out = json::array();
  for (auto& c : arr) {
    json o;
    o["id"] = c.value("id", "");
    o["name"] = c.value("name", "");
    o["created_at"] = c.value("created_at", "");
    out.push_back(o);
  }
  return jsonResponse(out);
}

inline Response routeClassCreate(const Request& req, const AppState& st) {
  json p;
  try { p = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }

  std::string className = p.value("class_name", "");
  std::string classPassword = p.value("class_password", "");
  std::string token = p.value("token", "");
  std::string jsonData = p.value("json_data", "");
  if (className.empty() || classPassword.empty() || token.empty() || jsonData.empty())
    return jsonError("缺少必要字段", 400);

  if (!verifyToken(st, token)) return jsonError("Token无效或已使用", 401);

  auto now = std::chrono::system_clock::now();
  long long ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                     now.time_since_epoch()).count();
  std::string classId = "class_" + std::to_string(ms);

  json data;
  try { data = json::parse(jsonData); }
  catch (...) { return jsonError("json_data 不是合法 JSON", 400); }

  LocalStore store = classStore(st, classId);
  store.set("data", encryptJson(data, classPassword));
  store.set("password_hash", sha256Hex(classPassword));

  json classes = loadClasses(st);
  json rec;
  rec["id"] = classId;
  rec["name"] = className;
  time_t t = time(nullptr);
  struct tm g;
#ifdef _WIN32
  gmtime_s(&g, &t);
#else
  gmtime_r(&t, &g);
#endif
  char stamp[32];
  snprintf(stamp, sizeof(stamp), "%04d-%02d-%02dT%02d:%02d:%02d.000Z",
           g.tm_year + 1900, g.tm_mon + 1, g.tm_mday, g.tm_hour, g.tm_min, g.tm_sec);
  rec["created_at"] = stamp;
  classes.push_back(rec);
  mainStore(st).set("classes", classes.dump(-1, ' ', false));

  json out;
  out["id"] = classId;
  out["name"] = className;
  out["message"] = "创建成功";
  return jsonResponse(out, 201);
}

inline Response routeClassGet(const Request& req, const AppState& st, bool studentsOnly) {
  std::string classId = getClassId(req.path);
  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");

  if (password.empty()) return jsonError("缺少密码参数", 400);
  if (passwordHash.empty()) return jsonError("缺少密码哈希参数", 400);

  LocalStore store = classStore(st, classId);
  auto enc = store.get("data");
  auto storedHash = store.get("password_hash");
  if (!enc || enc->empty()) return jsonError("班级不存在", 404);
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  json data;
  if (!decryptJson(*enc, password, data)) return jsonError("密码错误", 401);

  if (studentsOnly) {
    bool teachers = false;
    std::string t = lower(req.param("teachers"));
    if (t == "1" || t == "true" || t == "yes") teachers = true;
    json students = extractStudents(data, teachers);
    json out;
    out["class_id"] = classId;
    out["count"] = students.size();
    out["students"] = students;
    return jsonResponse(out);
  }

  json out;
  out["data"] = data;
  return jsonResponse(out);
}

inline Response routeClassPost(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");

  if (password.empty()) return jsonError("缺少密码参数", 400);
  if (passwordHash.empty()) return jsonError("缺少密码哈希参数", 400);

  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }
  if (!body.contains("data")) return jsonError("缺少 data 字段", 400);

  LocalStore store = classStore(st, classId);
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  store.set("data", encryptJson(body["data"], password));
  if (!storedHash || storedHash->empty()) store.set("password_hash", passwordHash);

  json out;
  out["message"] = "保存成功";
  return jsonResponse(out);
}

// ---------- UID 字典 ----------
// 读取并按学号数值升序整理的 uuids 映射
inline json loadUuidsSorted(LocalStore& store) {
  json rawObj = json::object();
  auto raw = store.get("uuids");
  if (raw && !raw->empty()) { try { rawObj = json::parse(*raw); } catch (...) { rawObj = json::object(); } }
  if (!rawObj.is_object()) rawObj = json::object();

  std::map<long long, json> byId;
  for (auto it = rawObj.begin(); it != rawObj.end(); ++it) {
    std::string k = it.key();
    if (k.empty()) continue;
    bool digits = true;
    for (char c : k) if (!isdigit((unsigned char)c)) { digits = false; break; }
    if (!digits) continue;
    std::vector<int> uid7;
    if (!parseUid(it.value(), uid7)) continue;
    byId[atoll(k.c_str())] = uid7;
  }
  json out = json::object();
  for (auto& kv : byId) out[std::to_string(kv.first)] = kv.second;
  return out;
}

inline std::string compactDump(const json& j) { return j.dump(-1, ' ', false); }

inline Response routeUuidsGet(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, classId);
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  json uuids = loadUuidsSorted(store);
  json out;
  out["class_id"] = classId;
  out["count"] = uuids.size();
  out["uuids"] = uuids;
  return jsonResponse(out);
}

inline Response routeUuidsAdd(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }
  if (!body.is_object()) return jsonError("请求体不是合法 JSON", 400);

  json sidRaw = body.contains("student_id") ? body["student_id"]
                                            : (body.contains("id") ? body["id"] : json());
  json uidRaw = body.contains("uid") ? body["uid"]
                                     : (body.contains("uuid") ? body["uuid"] : json());
  if (sidRaw.is_null()) return jsonError("缺少 student_id", 400);
  if (uidRaw.is_null()) return jsonError("缺少 uid", 400);

  long long sidNum = -1;
  if (sidRaw.is_number_integer()) sidNum = sidRaw.get<long long>();
  else if (sidRaw.is_string()) {
    std::string s = sidRaw.get<std::string>();
    size_t b = s.find_first_not_of(" \t\r\n");
    if (b != std::string::npos) {
      std::string t = s.substr(b, s.find_last_not_of(" \t\r\n") - b + 1);
      bool digits = !t.empty();
      for (char c : t) if (!isdigit((unsigned char)c)) { digits = false; break; }
      if (digits) sidNum = atoll(t.c_str());
    }
  }
  if (sidNum < 0) return jsonError("缺少或非法的 student_id", 400);

  std::vector<int> uid7;
  if (!parseUid(uidRaw, uid7)) return jsonError("缺少或非法的 uid（1~7 字节）", 400);

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, classId);
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  json uuids = loadUuidsSorted(store);
  std::string sid = std::to_string(sidNum);

  // 同一张卡不能绑两个学号
  for (auto it = uuids.begin(); it != uuids.end(); ++it) {
    if (it.key() == sid) continue;
    std::vector<int> other;
    if (parseUid(it.value(), other) && other == uid7)
      return jsonError("该 UID 已绑定学号 " + it.key(), 400);
  }

  bool added = !uuids.contains(sid);
  uuids[sid] = uid7;

  // 重新按学号数值升序落盘
  std::map<long long, json> byId;
  for (auto it = uuids.begin(); it != uuids.end(); ++it) byId[atoll(it.key().c_str())] = it.value();
  json ordered = json::object();
  for (auto& kv : byId) ordered[std::to_string(kv.first)] = kv.second;
  store.set("uuids", compactDump(ordered));

  json out;
  out["message"] = added ? "已追加" : "已更新";
  out["class_id"] = classId;
  out["added"] = added;
  out["count"] = ordered.size();
  out["uuids"] = ordered;
  return jsonResponse(out);
}

inline Response routeUuidsPost(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }

  json mapping = (body.is_object() && body.contains("uuids")) ? body["uuids"] : body;
  if (!mapping.is_object()) return jsonError("缺少 uuids（学号 -> UID 的 dict）", 400);

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, classId);
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  std::map<long long, json> byId;
  std::set<std::string> seenUids;
  for (auto it = mapping.begin(); it != mapping.end(); ++it) {
    std::string sid = it.key();
    bool digits = !sid.empty();
    for (char c : sid) if (!isdigit((unsigned char)c)) { digits = false; break; }
    if (!digits) return jsonError("非法学号: " + sid, 400);
    std::vector<int> uid7;
    if (!parseUid(it.value(), uid7))
      return jsonError("学号 " + std::to_string(atoll(sid.c_str())) + " 的 UID 非法（需要 1~7 字节）", 400);
    std::string key;
    for (int b : uid7) key.push_back((char)b);
    if (!seenUids.insert(key).second) return jsonError("存在重复的 UID，同一张卡不能绑定多个学号", 400);
    byId[atoll(sid.c_str())] = uid7;
  }

  json outUuids = json::object();
  for (auto& kv : byId) outUuids[std::to_string(kv.first)] = kv.second;
  store.set("uuids", compactDump(outUuids));

  json out;
  out["message"] = "已保存";
  out["class_id"] = classId;
  out["count"] = outUuids.size();
  out["uuids"] = outUuids;
  return jsonResponse(out);
}

inline Response routeTemplate() {
  Response r = textResponse(TEMPLATE_TEXT);
  r.headers["Content-Disposition"] =
      "attachment; filename=\"template.md\"; filename*=UTF-8''" + urlEncodeUtf8("班级数据收集指令.md");
  return r;
}

}  // namespace osc
