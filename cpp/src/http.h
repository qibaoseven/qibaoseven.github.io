// 极简 HTTP/1.1 服务端 + 客户端工具（跨平台，无第三方依赖）
#pragma once
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <thread>
#include <functional>
#include <atomic>

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #pragma comment(lib, "ws2_32.lib")
  typedef SOCKET sock_t;
  #define OSC_CLOSE closesocket
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <arpa/inet.h>
  #include <unistd.h>
  typedef int sock_t;
  #define OSC_CLOSE close
  #define INVALID_SOCKET (-1)
  #define SOCKET_ERROR (-1)
#endif

namespace osc {

inline std::string lower(std::string s);
inline std::string urlDecode(const std::string& in);

struct Request {
  std::string method;
  std::string path;                                  // 不含 query
  std::string query;                                 // ? 之后的部分
  std::map<std::string, std::string> headers;        // key 统一小写
  std::string body;

  std::string header(const std::string& name) const {
    auto it = headers.find(lower(name));
    return it == headers.end() ? std::string() : it->second;
  }

  // ?date=2026-11-25 → 值（未做 URL 解码以外的处理）
  std::string param(const std::string& name) const {
    if (query.empty()) return std::string();
    size_t pos = 0;
    while (pos < query.size()) {
      size_t amp = query.find('&', pos);
      std::string kv = query.substr(pos, (amp == std::string::npos ? query.size() : amp) - pos);
      size_t eq = kv.find('=');
      std::string k = eq == std::string::npos ? kv : kv.substr(0, eq);
      if (urlDecode(k) == name) {
        return eq == std::string::npos ? std::string() : urlDecode(kv.substr(eq + 1));
      }
      if (amp == std::string::npos) break;
      pos = amp + 1;
    }
    return std::string();
  }
};

struct Response {
  int status = 200;
  std::string contentType = "application/json; charset=utf-8";
  std::map<std::string, std::string> headers;
  std::string body;
  bool noBody = false;
};

inline std::string lower(std::string s) {
  for (auto& c : s) if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
  return s;
}

inline std::string urlEncodeUtf8(const std::string& in) {
  static const char* hex = "0123456789ABCDEF";
  std::string out;
  for (unsigned char c : in) {
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') out.push_back((char)c);
    else { out.push_back('%'); out.push_back(hex[c >> 4]); out.push_back(hex[c & 15]); }
  }
  return out;
}

inline std::string urlDecode(const std::string& in) {
  std::string out;
  for (size_t i = 0; i < in.size(); ++i) {
    if (in[i] == '%' && i + 2 < in.size()) {
      int v = 0;
      for (int k = 1; k <= 2; ++k) {
        char c = in[i + k];
        v <<= 4;
        if (c >= '0' && c <= '9') v += c - '0';
        else if (c >= 'a' && c <= 'f') v += c - 'a' + 10;
        else if (c >= 'A' && c <= 'F') v += c - 'A' + 10;
      }
      out.push_back((char)v);
      i += 2;
    } else if (in[i] == '+') {
      out.push_back(' ');
    } else {
      out.push_back(in[i]);
    }
  }
  return out;
}

class HttpServer {
public:
  using Handler = std::function<Response(const Request&)>;

  HttpServer(std::string host, int port) : host_(host), port_(port) {}

  bool start(const Handler& handler, std::string& err) {
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) { err = "WSAStartup 失败"; return false; }
#endif
    sock_t s = socket(AF_INET, SOCK_STREAM, 0);
    if (s == INVALID_SOCKET) { err = "socket() 失败"; return false; }

    int yes = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char*)&yes, sizeof(yes));

    sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((unsigned short)port_);
    if (host_ == "0.0.0.0" || host_.empty()) {
      addr.sin_addr.s_addr = htonl(INADDR_ANY);
    } else {
      addr.sin_addr.s_addr = inet_addr(host_.c_str());   // 仅支持 IPv4 字面量，够用
    }

    if (bind(s, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
      err = "端口 " + std::to_string(port_) + " 绑定失败（可能已被占用）";
      OSC_CLOSE(s);
      return false;
    }
    if (listen(s, 64) == SOCKET_ERROR) { err = "listen 失败"; OSC_CLOSE(s); return false; }

    printf("OpenStu (C++) 启动于 http://%s:%d/\n", host_.c_str(), port_);
    printf("  API 基址: /.netlify/functions/api/ 或 /api/\n");
    fflush(stdout);

    while (true) {
      sock_t c = accept(s, nullptr, nullptr);
      if (c == INVALID_SOCKET) continue;
      std::thread([c, handler]() { serveOne(c, handler); }).detach();
    }
    return true;
  }

private:
  static void serveOne(sock_t c, const Handler& handler) {
    Request req;
    std::string raw;
    char buf[4096];
    size_t headerEnd = std::string::npos;

    while (true) {
      int n = recv(c, buf, sizeof(buf), 0);
      if (n <= 0) { OSC_CLOSE(c); return; }
      raw.append(buf, (size_t)n);
      headerEnd = raw.find("\r\n\r\n");
      if (headerEnd != std::string::npos) break;
      if (raw.size() > 64 * 1024) { OSC_CLOSE(c); return; }
    }

    // 请求行 + 头
    std::string head = raw.substr(0, headerEnd);
    std::string bodyRaw = raw.substr(headerEnd + 4);

    size_t lineEnd = head.find("\r\n");
    std::string reqLine = lineEnd == std::string::npos ? head : head.substr(0, lineEnd);
    size_t s1 = reqLine.find(' ');
    size_t s2 = reqLine.rfind(' ');
    if (s1 == std::string::npos || s2 == s1) { OSC_CLOSE(c); return; }
    req.method = reqLine.substr(0, s1);
    std::string target = reqLine.substr(s1 + 1, s2 - s1 - 1);
    size_t qm = target.find('?');
    req.path = qm == std::string::npos ? target : target.substr(0, qm);
    req.query = qm == std::string::npos ? std::string() : target.substr(qm + 1);

    size_t pos = lineEnd == std::string::npos ? head.size() : lineEnd + 2;
    while (pos < head.size()) {
      size_t eol = head.find("\r\n", pos);
      if (eol == std::string::npos) eol = head.size();
      std::string line = head.substr(pos, eol - pos);
      size_t colon = line.find(':');
      if (colon != std::string::npos) {
        std::string k = lower(line.substr(0, colon));
        std::string v = line.substr(colon + 1);
        while (!v.empty() && (v.front() == ' ' || v.front() == '\t')) v.erase(0, 1);
        req.headers[k] = v;
      }
      pos = eol + 2;
    }

    size_t contentLen = 0;
    if (!req.header("content-length").empty()) contentLen = (size_t)atoll(req.header("content-length").c_str());
    if (req.header("expect") == "100-continue") {
      const char* cont = "HTTP/1.1 100 Continue\r\n\r\n";
      send(c, cont, (int)strlen(cont), 0);
    }
    while (bodyRaw.size() < contentLen) {
      int n = recv(c, buf, sizeof(buf), 0);
      if (n <= 0) break;
      bodyRaw.append(buf, (size_t)n);
    }
    req.body = bodyRaw.substr(0, std::min(bodyRaw.size(), contentLen));

    Response resp;
    try {
      resp = handler(req);
    } catch (const std::exception& e) {
      resp.status = 500;
      resp.contentType = "application/json; charset=utf-8";
      resp.body = std::string("{\"error\":") + jsonEscape(e.what()) + "}";
    }

    std::string out = "HTTP/1.1 " + std::to_string(resp.status) + " " + statusText(resp.status) + "\r\n";
    out += "Content-Type: " + resp.contentType + "\r\n";
    out += "Content-Length: " + std::to_string(resp.noBody ? 0 : resp.body.size()) + "\r\n";
    out += "Access-Control-Allow-Origin: *\r\n";
    out += "Access-Control-Allow-Headers: Content-Type, X-Password, X-Password-Hash\r\n";
    out += "Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE\r\n";
    for (auto& kv : resp.headers) out += kv.first + ": " + kv.second + "\r\n";
    out += "Connection: close\r\n\r\n";
    if (!resp.noBody) out += resp.body;

    send(c, out.c_str(), (int)out.size(), 0);
    OSC_CLOSE(c);
  }

  static std::string statusText(int code) {
    switch (code) {
      case 200: return "OK";
      case 201: return "Created";
      case 204: return "No Content";
      case 400: return "Bad Request";
      case 401: return "Unauthorized";
      case 404: return "Not Found";
      case 409: return "Conflict";
      case 500: return "Internal Server Error";
      default:  return "OK";
    }
  }

  static std::string jsonEscape(const std::string& s) {
    std::string out = "\"";
    for (char c : s) {
      switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
          if ((unsigned char)c < 0x20) { char b[8]; snprintf(b, 8, "\\u%04x", c); out += b; }
          else out += c;
      }
    }
    return out + "\"";
  }

  std::string host_;
  int port_;
};

// 打开默认浏览器（跨平台）
inline bool openBrowser(const std::string& url) {
#ifdef _WIN32
  std::string cmd = "start \"\" \"" + url + "\"";
  return system(cmd.c_str()) == 0;
#elif __APPLE__
  std::string cmd = "open \"" + url + "\"";
  return system(cmd.c_str()) == 0;
#else
  std::string cmd = "xdg-open \"" + url + "\" >/dev/null 2>&1 &";
  return system(cmd.c_str()) == 0;
#endif
}

}  // namespace osc
