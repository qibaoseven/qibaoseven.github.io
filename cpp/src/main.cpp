// ========================================
// OpenStu v0.46 (C++) · 单文件可执行程序入口
// ========================================
// 双击运行：读同目录 config.txt → 起 HTTP 服务 → 自动打开浏览器
// 前端已打包进 exe（cpp/tools/gen_assets.py 生成），不需要额外文件
// ========================================
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <map>
#include <fstream>
#include <filesystem>
#include <thread>
#include <chrono>

#include "src/http.h"
#include "src/core.h"
#include "src/api.h"
#include "src/assets.h"


using namespace osc;

static std::string exeDir(const char* argv0) {
  std::filesystem::path p(argv0 ? argv0 : ".");
  std::filesystem::path dir = std::filesystem::absolute(p).parent_path();
  return dir.string();
}

struct Config {
  std::string host = "127.0.0.1";
  int port = 8080;
  bool openBrowserFlag = true;
  std::string dataDir = "data";
  std::string browserUrl;      // 留空 = 用 http://host:port/
};

static std::string trim(const std::string& s) {
  size_t b = s.find_first_not_of(" \t\r\n");
  if (b == std::string::npos) return std::string();
  size_t e = s.find_last_not_of(" \t\r\n");
  return s.substr(b, e - b + 1);
}

static void writeDefaultConfig(const std::string& path) {
  std::ofstream out(path);
  out << "# OpenStu (C++) 配置\n"
         "# host: 监听地址，127.0.0.1 = 只允许本机访问；0.0.0.0 = 局域网可访问\n"
         "# port: 端口，被占用就换一个\n"
         "# open_browser: 启动后是否自动打开浏览器（1/0）\n"
         "# data_dir: 数据目录，相对路径以 exe 所在目录为基准\n"
         "# browser_url: 自动打开的地址，留空 = http://<host>:<port>/\n"
         "host=127.0.0.1\n"
         "port=8080\n"
         "open_browser=1\n"
         "data_dir=data\n"
         "browser_url=\n";
}

static Config loadConfig(const std::string& dir) {
  Config cfg;
  std::string path = dir + "/config.txt";
  std::ifstream in(path);
  if (!in) {
    writeDefaultConfig(path);
    printf("[cfg] 未找到 config.txt，已生成默认配置: %s\n", path.c_str());
    return cfg;
  }
  std::string line;
  while (std::getline(in, line)) {
    line = trim(line);
    if (line.empty() || line[0] == '#') continue;
    size_t eq = line.find('=');
    if (eq == std::string::npos) continue;
    std::string k = trim(line.substr(0, eq));
    std::string v = trim(line.substr(eq + 1));
    if (k == "host" && !v.empty()) cfg.host = v;
    else if (k == "port") cfg.port = atoi(v.c_str());
    else if (k == "open_browser") cfg.openBrowserFlag = !(v == "0" || lower(v) == "false");
    else if (k == "data_dir" && !v.empty()) cfg.dataDir = v;
    else if (k == "browser_url") cfg.browserUrl = v;
  }
  if (cfg.port <= 0 || cfg.port > 65535) cfg.port = 8080;
  return cfg;
}

int main(int argc, char** argv) {
#ifdef _WIN32
  // 双击运行时控制台中文不乱码
  system("chcp 65001 > nul");
#endif
  std::string dir = exeDir(argc > 0 ? argv[0] : nullptr);
  printf("OpenStu v0.46 (C++)\n");
  printf("  程序目录: %s\n", dir.c_str());

  Config cfg = loadConfig(dir);

  // 数据目录：相对路径跟着 exe 走
  std::string dataRoot = cfg.dataDir;
  if (!dataRoot.empty() && dataRoot[0] != '/' && !(dataRoot.size() > 1 && dataRoot[1] == ':'))
    dataRoot = dir + "/" + dataRoot;
  std::filesystem::create_directories(dataRoot);

  AppState state{dataRoot};

  HttpServer server(cfg.host, cfg.port);
  std::string url = !cfg.browserUrl.empty() ? cfg.browserUrl
                                            : ("http://" + std::string(cfg.host == "0.0.0.0" ? "127.0.0.1" : cfg.host)
                                               + ":" + std::to_string(cfg.port) + "/");

  if (cfg.openBrowserFlag) {
    std::thread([url]() {
      std::this_thread::sleep_for(std::chrono::milliseconds(600));
      printf("[web] 打开浏览器: %s\n", url.c_str());
      openBrowser(url);
    }).detach();
  } else {
    printf("[web] 请手动访问: %s\n", url.c_str());
  }

  std::string err;
  return server.start([&state](const Request& req) -> Response {
    // API：两条前缀都认
    if (req.path.rfind("/api", 0) == 0 || req.path.rfind("/.netlify/functions/api", 0) == 0) {
      bool matched = false;
      return handleApi(req, state, matched);
    }

    // 静态前端（已内嵌）
    size_t n = 0;
    const Asset* table = assetTable(n);
    std::string path = req.path.empty() ? "/" : req.path;
    if (path == "/") path = "/index.html";

    for (size_t i = 0; i < n; ++i) {
      if (path == table[i].path) {
        Response r;
        r.status = 200;
        r.contentType = table[i].mime;
        r.body.assign((const char*)table[i].data, table[i].size);
        return r;
      }
    }

    Response r;
    r.status = 404;
    r.contentType = "text/plain; charset=utf-8";
    r.body = "404 Not Found: " + path;
    return r;
  }, err) ? 0 : (printf("[err] %s\n", err.c_str()), 1);
}
