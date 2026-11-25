// 路由分发：顺序严格照搬 Python 版的 includes 匹配
#include "src/core.h"
#include "src/routes_basic.h"
#include "src/routes_homework.h"
#include "src/routes_journal.h"

namespace osc {

static bool has(const std::string& s, const char* needle) {
  return s.find(needle) != std::string::npos;
}

Response handleApi(const Request& req, const AppState& st, bool& matched) {
  matched = true;
  const std::string& p = req.path;
  const std::string& m = req.method;

  if (m == "OPTIONS") {
    Response r;
    r.status = 204;
    r.noBody = true;
    return r;
  }

  try {
    if (m == "GET" && has(p, "/api/classes")) return routeClassesList(req, st);

    if (m == "POST" && has(p, "/api/classes/import"))
      return jsonError("C++ 版暂不支持从 JsonBin 导入，请用导出的 JSON 手动创建班级", 400);

    if (m == "POST" && has(p, "/api/classes/create")) return routeClassCreate(req, st);

    if (m == "GET" && has(p, "/api/class/") && has(p, "/students"))
      return routeClassGet(req, st, true);

    if (m == "GET" && has(p, "/api/class/") && !has(p, "/homework") && !has(p, "/journal")
        && !has(p, "/students") && !has(p, "/uuids"))
      return routeClassGet(req, st, false);

    if (m == "POST" && has(p, "/api/class/") && !has(p, "/homework") && !has(p, "/journal")
        && !has(p, "/students") && !has(p, "/uuids"))
      return routeClassPost(req, st);

    if (m == "GET" && has(p, "/api/template")) return routeTemplate();

    // UID
    if (m == "GET" && has(p, "/api/class/") && has(p, "/uuids")) return routeUuidsGet(req, st);
    if (m == "POST" && has(p, "/api/class/") && has(p, "/uuids/add")) return routeUuidsAdd(req, st);
    if (m == "POST" && has(p, "/api/class/") && has(p, "/uuids")) return routeUuidsPost(req, st);

    // 作业
    if (m == "POST" && has(p, "/api/class/") && has(p, "/homework/init")) return routeHomeworkInit(req, st);
    if (m == "GET" && has(p, "/api/class/") && has(p, "/homework/meta")) return routeHomeworkMeta(req, st);
    if (m == "GET" && has(p, "/api/class/") && has(p, "/homework/status")) return routeHomeworkStatus(req, st);
    if (m == "GET" && has(p, "/api/class/") && has(p, "/homework/required")) return routeHomeworkRequired(req, st);

    if (m == "GET" && has(p, "/api/class/") && has(p, "/homework")
        && !has(p, "/meta") && !has(p, "/status") && !has(p, "/required")
        && !has(p, "/student") && !has(p, "/raw"))
      return routeHomeworkGet(req, st);

    if (m == "GET" && has(p, "/api/class/") && has(p, "/homework/raw") && !has(p, "/download"))
      return routeHomeworkRaw(req, st);

    if (m == "DELETE" && has(p, "/api/class/") && has(p, "/homework")) return routeHomeworkDelete(req, st);

    if (m == "GET" && has(p, "/api/class/") && has(p, "/homework/student/")) return routeHomeworkStudent(req, st);
    if (m == "POST" && has(p, "/api/class/") && has(p, "/homework/update")) return routeHomeworkUpdate(req, st);
    if (m == "POST" && has(p, "/api/class/") && has(p, "/homework/day")) return routeHomeworkDay(req, st);

    // 历程
    if (m == "GET" && has(p, "/api/class/") && has(p, "/journal/")) return routeJournalOne(req, st);
    if (m == "GET" && has(p, "/api/class/") && has(p, "/journals")) return routeJournalsBatch(req, st);
    if (m == "POST" && has(p, "/api/class/") && has(p, "/journal")) return routeJournalAppend(req, st);
    if (m == "GET" && has(p, "/api/class/") && has(p, "/journal-export")) return routeJournalExport(req, st);

    matched = false;
    json out;
    out["error"] = "Not Found";
    out["path"] = p;
    return jsonResponse(out, 404);
  } catch (const std::exception& e) {
    json out;
    out["error"] = std::string("服务器内部错误: ") + e.what();
    out["path"] = p;
    return jsonResponse(out, 500);
  }
}

}  // namespace osc
