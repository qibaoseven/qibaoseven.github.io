// 历程子系统路由（对应 python/v0.46 backend/journal.py + api.py 的 journal 段）
#pragma once
#include "src/core.h"

namespace osc {

inline Response routeJournalOne(const Request& req, const AppState& st) {
  std::smatch m;
  std::regex re("/journal/([A-Za-z0-9_-]+)");
  std::string sid;
  if (std::regex_search(req.path, m, re)) sid = m.str(1);
  if (!validStudentId(sid)) return jsonError("无效的学号", 400);

  LocalStore store = classStore(st, getClassId(req.path));
  std::string text = readJournal(store, sid);
  json out;
  out["student_id"] = sid;
  out["journal"] = text;
  out["length"] = utf8Length(text);
  return jsonResponse(out);
}

inline Response routeJournalsBatch(const Request& req, const AppState& st) {
  std::string idsParam = req.param("ids");
  std::vector<std::string> ids;
  {
    size_t pos = 0;
    while (pos <= idsParam.size()) {
      size_t comma = idsParam.find(',', pos);
      std::string piece = idsParam.substr(pos, comma == std::string::npos ? std::string::npos : comma - pos);
      // trim
      while (!piece.empty() && isspace((unsigned char)piece.front())) piece.erase(0, 1);
      while (!piece.empty() && isspace((unsigned char)piece.back())) piece.pop_back();
      if (!piece.empty()) ids.push_back(piece);
      if (comma == std::string::npos) break;
      pos = comma + 1;
    }
  }
  if (ids.size() > 200) return jsonError("一次最多查询 200 名学生", 400);

  LocalStore store = classStore(st, getClassId(req.path));
  json journals = json::object();
  for (auto& raw : ids) {
    if (!validStudentId(raw)) continue;
    std::string text = readJournal(store, raw);
    json item;
    item["journal"] = text;
    item["length"] = utf8Length(text);
    journals[raw] = item;
  }
  json out;
  out["journals"] = journals;
  return jsonResponse(out);
}

inline Response routeJournalAppend(const Request& req, const AppState& st) {
  json body;
  try { body = json::parse(req.body.empty() ? "{}" : req.body); }
  catch (...) { return jsonError("请求体不是合法 JSON", 400); }
  if (!body.is_object()) return jsonError("请求体不是合法 JSON", 400);

  std::string sid = body.contains("student_id") && body["student_id"].is_string()
                        ? body["student_id"].get<std::string>() : std::string();
  if (!validStudentId(sid)) return jsonError("缺少或非法的 student_id", 400);

  std::string content = body.contains("content") && body["content"].is_string()
                            ? body["content"].get<std::string>() : std::string();
  if (content.empty()) return jsonError("content 不能为空", 400);
  {
    size_t b = content.find_first_not_of(" \t\r\n");
    if (b == std::string::npos) return jsonError("content 不能为空", 400);
  }

  std::string opName = body.value("operator_name", "");
  std::string op = body.value("operator", "");
  std::string opRole = body.value("operator_role", "");

  LocalStore store = classStore(st, getClassId(req.path));
  std::string old = readJournal(store, sid);
  if (utf8Length(old) + utf8Length(content) > JOURNAL_MAX_LEN)
    return jsonError("历程内容超出上限（" + std::to_string(JOURNAL_MAX_LEN) + " 字符）", 400);

  std::string stamp = nowStamp();
  std::string who = !opName.empty() ? opName : (!op.empty() ? op : "未知");
  std::string tag = (opRole == "user") ? "" : ("〔" + who + "〕");
  std::string block = "[" + stamp + "]" + tag + " " + content + "\n";

  std::string next = old + block;
  store.set(journalKey(sid), next);

  json out;
  out["message"] = "已追加";
  out["student_id"] = sid;
  out["appended"] = block;
  out["journal"] = next;
  out["length"] = utf8Length(next);
  return jsonResponse(out);
}

inline Response routeJournalExport(const Request& req, const AppState& st) {
  std::string idsParam = req.param("ids");
  std::string namesParam = req.param("names");

  std::vector<std::string> ids, names;
  auto split = [](const std::string& s, std::vector<std::string>& out) {
    size_t pos = 0;
    while (pos <= s.size()) {
      size_t comma = s.find(',', pos);
      std::string piece = s.substr(pos, comma == std::string::npos ? std::string::npos : comma - pos);
      while (!piece.empty() && isspace((unsigned char)piece.front())) piece.erase(0, 1);
      while (!piece.empty() && isspace((unsigned char)piece.back())) piece.pop_back();
      if (!piece.empty()) out.push_back(piece);
      if (comma == std::string::npos) break;
      pos = comma + 1;
    }
  };
  split(idsParam, ids);
  split(namesParam, names);

  LocalStore store = classStore(st, getClassId(req.path));
  std::string stamp = nowStamp();

  std::string full;
  full += "========================================\n";
  full += "学生历程导出\n";
  full += "导出时间：" + stamp + "\n";
  full += "学生人数：" + std::to_string(ids.size()) + "\n";
  full += "========================================\n\n";

  for (size_t i = 0; i < ids.size(); ++i) {
    std::string sid = ids[i];
    if (!validStudentId(sid)) continue;
    std::string name = i < names.size() ? names[i] : "";
    std::string text = readJournal(store, sid);
    full += "---------- " + (name.empty() ? std::string("未知") : name) + "（学号 " + sid + "） ----------\n";
    if (text.find_first_not_of(" \t\r\n") == std::string::npos) full += "（暂无历程记录）\n";
    else {
      std::string trimmed = text;
      if (!trimmed.empty() && trimmed.back() == '\n') trimmed.pop_back();
      full += trimmed + "\n";
    }
    full += "\n";
  }

  Response r = textResponse(full, 200, "text/plain; charset=utf-8");
  char name[64];
  snprintf(name, sizeof(name), "journals_%04d-%02d-%02d.txt",
           todayLocal().y, todayLocal().m, todayLocal().d);
  r.headers["Content-Disposition"] = std::string("attachment; filename=\"") + name + "\"";
  return r;
}

}  // namespace osc
