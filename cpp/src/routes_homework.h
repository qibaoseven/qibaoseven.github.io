// 作业子系统路由（对应 python/v0.46 backend/api.py 的 homework 段）
#pragma once
#include "src/core.h"

namespace osc {

inline Response routeHomeworkInit(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }

  if (!body.contains("student_count") || !body["student_count"].is_number())
    return jsonError("学生数量必须大于0", 400);
  if (!body.contains("subject_count") || !body["subject_count"].is_number())
    return jsonError("学科数量必须大于0", 400);
  if (!body.contains("subject_names") || !body["subject_names"].is_object())
    return jsonError("请提供学科名称映射,格式: { \"0\": \"语文\", \"1\": \"数学\" }", 400);

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, classId);
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  int studentCount = body["student_count"].get<int>();
  int subjectCount = body["subject_count"].get<int>();
  if (studentCount < 1) return jsonError("学生数量必须大于0", 400);
  if (subjectCount < 1) return jsonError("学科数量必须大于0", 400);

  json names = body["subject_names"];
  json normalized = json::object();
  for (int i = 0; i < subjectCount; ++i) {
    json v;
    std::string key = std::to_string(i);
    if (names.contains(key)) v = names[key];
    if (v.is_null()) return jsonError("学科名称映射不完整,需要包含 0 到 " +
                                      std::to_string(subjectCount - 1) + " 的所有学科", 400);
    std::string text = v.is_string() ? v.get<std::string>() : "";
    if (text.empty()) return jsonError("学科 " + std::to_string(i) + " 的名称不能为空", 400);
    normalized[std::to_string(i)] = text;
  }

  auto existing = store.get("homework_meta");
  if (existing && !existing->empty())
    return jsonError("该班级已初始化作业系统,如需重新初始化请先删除数据", 400);

  Date start = todayLocal();
  if (body.contains("start_date") && body["start_date"].is_string()) {
    Date parsed;
    if (parseDate(body["start_date"].get<std::string>(), parsed)) start = parsed;
  }

  int actualStudents = studentCount + 1;
  HwData data(1, std::vector<std::vector<int>>(actualStudents,
              std::vector<int>(subjectCount, 0)));
  if (!hwSave(store, data, password)) return jsonError("保存作业数据失败", 400);

  json meta;
  meta["studentCount"] = studentCount;
  meta["subjectCount"] = subjectCount;
  meta["subjectNames"] = normalized;
  time_t t = time(nullptr);
  struct tm g;
#ifdef _WIN32
  gmtime_s(&g, &t);
#else
  gmtime_r(&t, &g);
#endif
  char stamp[40];
  snprintf(stamp, sizeof(stamp), "%04d-%02d-%02dT%02d:%02d:%02d.000Z",
           g.tm_year + 1900, g.tm_mon + 1, g.tm_mday, g.tm_hour, g.tm_min, g.tm_sec);
  meta["initializedAt"] = stamp;
  meta["startDate"] = isoDate(start);
  store.set("homework_meta", meta.dump(-1, ' ', false));

  json out, outMeta;
  out["success"] = true;
  out["message"] = "作业系统初始化成功";
  outMeta["studentCount"] = studentCount;
  outMeta["subjectCount"] = subjectCount;
  outMeta["subjectNames"] = normalized;
  outMeta["actualStudents"] = actualStudents;
  outMeta["startDate"] = isoDate(start);
  out["meta"] = outMeta;
  return jsonResponse(out);
}

inline Response routeHomeworkMeta(const Request& req, const AppState& st) {
  LocalStore store = classStore(st, getClassId(req.path));
  auto raw = store.get("homework_meta");
  if (!raw || raw->empty()) return jsonError("作业系统未初始化", 404);
  try { return jsonResponse(json::parse(*raw)); }
  catch (...) { return jsonError("作业系统未初始化", 404); }
}

inline Response routeHomeworkStatus(const Request& req, const AppState& st) {
  LocalStore store = classStore(st, getClassId(req.path));
  auto raw = store.get("homework_meta");
  bool init = raw && !raw->empty();
  json out;
  out["initialized"] = init;
  out["message"] = init ? "作业系统已初始化" : "作业系统未初始化";
  return jsonResponse(out);
}

inline Response routeHomeworkRequired(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  if (classId.empty()) return jsonError("class not right", 401, "CLASS_NOT_RIGHT");

  std::string dateParam = req.param("date");
  std::string date = dateParam.empty() ? isoDate(todayLocal()) : dateParam;
  Date parsed;
  if (!parseDate(date, parsed)) return jsonError("无效的日期，应为 YYYY-MM-DD", 400);
  date = isoDate(parsed);

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, classId);
  auto classData = store.get("data");
  if (!classData || classData->empty())
    return jsonError("class not right", 401, "CLASS_NOT_RIGHT");

  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401, "BAD_PASSWORD");

  json meta = json::object();
  auto metaRaw = store.get("homework_meta");
  if (metaRaw && !metaRaw->empty()) { try { meta = json::parse(*metaRaw); } catch (...) {} }

  std::vector<int> required = requiredForDate(store, date);

  int submitted = 0;
  if (!required.empty()) {
    HwData data;
    try {
      if (hwLoad(store, password, data)) submitted = countSubmitted(data, parsed, required);
    } catch (...) { submitted = 0; }
  }

  int studentCount = meta.value("studentCount", 0);
  json out;
  out["class_id"] = classId;
  out["date"] = date;
  out["required"] = required;
  out["subjectNames"] = meta.value("subjectNames", json::object());
  out["studentCount"] = studentCount;
  out["submitted"] = submitted;
  out["total"] = studentCount * (int)required.size();
  return jsonResponse(out);
}

inline Response routeHomeworkGet(const Request& req, const AppState& st) {
  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, getClassId(req.path));
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  HwData data;
  bool exists = false;
  try { exists = hwLoad(store, password, data); }
  catch (...) { return jsonError("密码错误", 401); }
  if (!exists) return jsonError("作业数据不存在", 404);

  json out = hwDateRange(data);
  out["data"] = data;
  // 键顺序与 Python 不同无所谓，前端按字段取值
  return jsonResponse(out);
}

inline Response routeHomeworkRaw(const Request& req, const AppState& st) {
  LocalStore store = classStore(st, getClassId(req.path));
  auto raw = store.get("homework_data");
  if (!raw || raw->empty()) return jsonError("作业数据不存在", 404);

  std::vector<uint8_t> buf;
  base64Decode(*raw, buf);

  json meta = json::object();
  auto metaRaw = store.get("homework_meta");
  if (metaRaw && !metaRaw->empty()) { try { meta = json::parse(*metaRaw); } catch (...) {} }

  json out;
  out["data"] = *raw;
  out["meta"] = meta.empty() ? json(nullptr) : meta;
  out["encoding"] = "base64";
  out["size"] = (long long)buf.size();
  return jsonResponse(out);
}

inline Response routeHomeworkDelete(const Request& req, const AppState& st) {
  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, getClassId(req.path));
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  store.del("homework_data");
  store.del("homework_meta");
  json out;
  out["message"] = "作业数据已删除";
  return jsonResponse(out);
}

inline Response routeHomeworkStudent(const Request& req, const AppState& st) {
  std::smatch m;
  std::regex re("/student/(\\d+)");
  if (!std::regex_search(req.path, m, re)) return jsonError("无效的学生ID", 400);
  int studentId = atoi(m.str(1).c_str());
  if (studentId <= 0) return jsonError("无效的学生ID", 400);

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, getClassId(req.path));
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  std::string targetDate = req.param("date");
  HwData data;
  bool exists = false;
  try { exists = hwLoad(store, password, data); }
  catch (...) { return jsonError("密码错误", 401); }
  if (!exists) return jsonError("作业数据不存在", 404);

  if (!targetDate.empty()) {
    Date parsed;
    if (!parseDate(targetDate, parsed)) return jsonError("无效的日期", 400);
    int totalDays = (int)data.size();
    Date from = addDays(todayLocal(), -(totalDays - 1));
    int idx = daysBetween(parsed, from);
    if (idx < 0 || idx >= totalDays || studentId >= (int)data[idx].size())
      return jsonError("未找到数据", 404);
    json out;
    out["date"] = targetDate;
    out["studentId"] = studentId;
    out["homework"] = data[idx][studentId];
    return jsonResponse(out);
  }

  int totalDays = (int)data.size();
  Date from = addDays(todayLocal(), -(totalDays - 1));
  json arr = json::array();
  for (int day = 0; day < totalDays; ++day) {
    if (studentId >= (int)data[day].size()) continue;
    json item;
    item["date"] = isoDate(addDays(from, day));
    item["homework"] = data[day][studentId];
    arr.push_back(item);
  }
  json out;
  out["studentId"] = studentId;
  out["data"] = arr;
  return jsonResponse(out);
}

inline Response routeHomeworkUpdate(const Request& req, const AppState& st) {
  std::string classId = getClassId(req.path);
  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }
  if (!body.is_object()) return jsonError("请求体不是合法 JSON", 400);

  json sidRaw = body.contains("student_id") ? body["student_id"] : json();
  json uidRaw = body.contains("uid") ? body["uid"]
                : (body.contains("uuid") ? body["uuid"]
                : (body.contains("card_uid") ? body["card_uid"] : json()));
  std::string targetDate = body.value("target_date", "");
  json subjectRaw = body.contains("subject_id") ? body["subject_id"] : json();

  if (sidRaw.is_null() && uidRaw.is_null())
    return jsonError("缺少学生标识: 需要 student_id 或 uid", 400);
  if (targetDate.empty() || subjectRaw.is_null())
    return jsonError("缺少必要参数: target_date, subject_id", 400);

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, classId);
  auto classData = store.get("data");
  if (!classData || classData->empty())
    return jsonError("class not right", 401, "CLASS_NOT_RIGHT");

  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401, "BAD_PASSWORD");

  int resolvedId = -1;
  if (sidRaw.is_null()) {
    std::vector<int> uid7;
    if (!parseUid(uidRaw, uid7)) return jsonError("缺少或非法的 uid（1~7 字节）", 400);

    json uuids = json::object();
    auto raw = store.get("uuids");
    if (raw && !raw->empty()) { try { uuids = json::parse(*raw); } catch (...) {} }
    for (auto it = uuids.begin(); it != uuids.end(); ++it) {
      std::vector<int> candidate;
      if (!parseUid(it.value(), candidate)) continue;
      if (candidate == uid7) { resolvedId = atoi(it.key().c_str()); break; }
    }
    if (resolvedId < 0) return jsonError("该 UID 尚未绑定学号", 404, "UID_NOT_BOUND");
  } else {
    if (sidRaw.is_string()) {
      std::string s = sidRaw.get<std::string>();
      for (char c : s) if (!isdigit((unsigned char)c)) return jsonError("无效的学生ID", 400);
      resolvedId = atoi(s.c_str());
    } else if (sidRaw.is_number_integer()) {
      resolvedId = sidRaw.get<int>();
    } else {
      return jsonError("无效的学生ID", 400);
    }
    if (resolvedId <= 0) return jsonError("无效的学生ID", 400);
  }

  int subjectId;
  if (subjectRaw.is_number_integer()) subjectId = subjectRaw.get<int>();
  else if (subjectRaw.is_string()) {
    try { subjectId = std::stoi(subjectRaw.get<std::string>()); } catch (...) {
      return jsonError("无效的学科ID", 400);
    }
  } else return jsonError("无效的学科ID", 400);

  std::vector<int> required = requiredForDate(store, targetDate);
  if (required.empty() || std::find(required.begin(), required.end(), subjectId) == required.end()) {
    json out;
    out["error"] = "not needed to send";
    out["code"] = "SUBJECT_NOT_REQUIRED";
    out["target_date"] = targetDate;
    out["subject_id"] = subjectId;
    out["required"] = required;
    return jsonResponse(out, 409);
  }

  HwData data;
  bool exists = false;
  try { exists = hwLoad(store, password, data); }
  catch (...) { return jsonError("密码错误", 401); }
  if (!exists) data = {{{0}, {0}}};   // 0 号机器人 + 1 号学生

  int totalDays = (int)data.size();
  int actualStudents = (int)data[0].size();
  int subjects = (int)data[0][0].size();
  Date from = addDays(todayLocal(), -(totalDays - 1));

  Date target;
  if (!parseDate(targetDate, target)) return jsonError("无效的日期", 400);
  int dayIndex = daysBetween(target, from);
  if (dayIndex < 0) {
    for (int i = 0; i < -dayIndex; ++i)
      data.insert(data.begin(), std::vector<std::vector<int>>(actualStudents,
                                        std::vector<int>(subjects, 0)));
    dayIndex = 0;
  } else if (dayIndex >= totalDays) {
    for (int i = 0; i < dayIndex - totalDays + 1; ++i)
      data.push_back(std::vector<std::vector<int>>(actualStudents, std::vector<int>(subjects, 0)));
  }

  actualStudents = (int)data[0].size();
  subjects = (int)data[0][0].size();
  if (resolvedId <= 0 || resolvedId >= actualStudents)
    return jsonError("无效的学生ID: " + std::to_string(resolvedId), 400);
  if (subjectId < 0 || subjectId >= subjects)
    return jsonError("无效的学科ID: " + std::to_string(subjectId), 400);

  bool wasSet = data[dayIndex][resolvedId][subjectId] == 1;
  data[dayIndex][resolvedId][subjectId] = 1;
  bool saved = hwSave(store, data, password);
  if (!saved) return jsonError("保存失败", 500);

  json out;
  out["message"] = "更新成功";
  out["student_id"] = resolvedId;
  out["target_date"] = targetDate;
  out["subject_id"] = subjectId;
  out["changed"] = !wasSet;
  return jsonResponse(out);
}

inline Response routeHomeworkDay(const Request& req, const AppState& st) {
  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }

  if (!body.contains("day_data") || !body["day_data"].is_array() || body["day_data"].empty())
    return jsonError("缺少必要参数: day_data", 400);
  std::string targetDate = body.value("target_date", "");
  if (targetDate.empty()) targetDate = isoDate(todayLocal());

  std::string password = req.header("x-password");
  std::string passwordHash = req.header("x-password-hash");
  if (password.empty() || passwordHash.empty()) return jsonError("需要密码验证", 401);

  LocalStore store = classStore(st, getClassId(req.path));
  auto storedHash = store.get("password_hash");
  if (storedHash && !storedHash->empty() && *storedHash != passwordHash)
    return jsonError("密码错误", 401);

  std::vector<std::vector<int>> day;   // 一天的数据：学生 × 学科
  int subjects = -1;
  for (auto& row : body["day_data"]) {
    if (!row.is_array()) return jsonError("学生数据长度不一致", 400);
    if (subjects < 0) subjects = (int)row.size();
    if ((int)row.size() != subjects) return jsonError("学生数据长度不一致", 400);
    std::vector<int> r;
    for (auto& x : row) r.push_back(x.is_number() ? x.get<int>() : 0);
    day.push_back(r);
  }

  HwData data;
  bool exists = false;
  try { exists = hwLoad(store, password, data); }
  catch (...) { return jsonError("密码错误", 401); }

  if (exists && !data.empty()) {
    int existingStudents = (int)data[0].size();
    int existingSubjects = (int)data[0][0].size();
    if (existingStudents != (int)day.size())
      return jsonError("学生数量不匹配: 现有 " + std::to_string(existingStudents) +
                       ", 新数据 " + std::to_string(day.size()), 400);
    if (existingSubjects != subjects)
      return jsonError("学科数量不匹配: 现有 " + std::to_string(existingSubjects) +
                       ", 新数据 " + std::to_string(subjects), 400);

    int totalDays = (int)data.size();
    Date from = addDays(todayLocal(), -(totalDays - 1));
    Date target;
    if (!parseDate(targetDate, target)) return jsonError("无效的日期", 400);
    int dayIndex = daysBetween(target, from);
    if (dayIndex < 0) {
      for (int i = 0; i < -dayIndex; ++i)
        data.insert(data.begin(), std::vector<std::vector<int>>((int)day.size(),
                                          std::vector<int>(subjects, 0)));
      dayIndex = 0;
    } else if (dayIndex >= totalDays) {
      for (int i = 0; i < dayIndex - totalDays + 1; ++i)
        data.push_back(std::vector<std::vector<int>>((int)day.size(), std::vector<int>(subjects, 0)));
    }
    data[dayIndex] = day;
  } else {
    data.push_back(day);
  }

  if (!hwSave(store, data, password)) return jsonError("保存失败", 500);

  std::vector<int> required;
  if (body.contains("required_subjects") && body["required_subjects"].is_array()) {
    std::vector<int> req;
    for (auto& x : body["required_subjects"]) {
      if (x.is_number()) req.push_back(x.get<int>());
      else if (x.is_string()) { try { req.push_back(std::stoi(x.get<std::string>())); } catch (...) {} }
    }
    required = setRequiredForDate(store, targetDate, req);
  } else {
    required = requiredForDate(store, targetDate);
  }

  json out;
  out["message"] = "添加成功";
  out["target_date"] = targetDate;
  out["required"] = required;
  return jsonResponse(out);
}

}  // namespace osc
