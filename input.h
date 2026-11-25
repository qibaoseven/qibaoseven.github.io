#ifndef HOMEWORK_WIFI_CONFIG
#define HOMEWORK_WIFI_CONFIG

#include <Arduino.h>
#include <string.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <LittleFS.h>
#include "screen.h"
#include "sha256.h"

// ========================================
// 配网 + 班级配置（无按键版）
// ========================================
// 一次 AP 配网同时收两样东西：
//   1) WiFi 名称 / 密码          -> /wifi.txt
//   2) 班级 ID / 班级密码        -> /class.txt，哈希由本机 sha256 自己算
// 凭据落在 LittleFS，重启不丢。
// ========================================

#define WIFI_CONFIG_FILE   "/wifi.txt"
#define CLASS_CONFIG_FILE  "/class.txt"
#define AP_SSID            "OpenStu-Config"
#define AP_PASSWORD        "openstu1234"   // 至少 8 位；改成 "" 就是开放热点
#define AP_TIMEOUT_MS      180000UL        // 3 分钟没人配网就放弃
#define AP_REPLY_DELAY_MS  800             // 响应发完再拆热点，否则手机端报错

char wifiSsid[51]     = {0};
char wifiPassword[51] = {0};

// 班级配置：密码明文也留一份（配网页回填/校验用），哈希开机时现算
char classId[40]           = {0};
char classPassword[40]     = {0};
char classPasswordHash[65] = {0};

static bool _fsReady = false;

static bool ensureFs() {
  if (_fsReady) return true;
  _fsReady = LittleFS.begin();
  if (!_fsReady) Serial.println("[fs] LittleFS mount failed");
  return _fsReady;
}

// ========================================
// WiFi 凭据
// ========================================
bool loadWifiConfig() {
  if (!ensureFs()) return false;
  File f = LittleFS.open(WIFI_CONFIG_FILE, "r");
  if (!f) return false;

  String s = f.readStringUntil('\n'); s.trim();
  String p = f.readStringUntil('\n'); p.trim();
  f.close();

  if (s.length() == 0) return false;
  s.toCharArray(wifiSsid, sizeof(wifiSsid));
  p.toCharArray(wifiPassword, sizeof(wifiPassword));
  Serial.printf("[wifi] loaded ssid=%s\n", wifiSsid);
  return true;
}

bool saveWifiConfig(const char* ssid, const char* pwd) {
  if (!ensureFs()) return false;
  File f = LittleFS.open(WIFI_CONFIG_FILE, "w");
  if (!f) return false;
  f.print(ssid); f.print('\n');
  f.print(pwd);  f.print('\n');
  f.close();

  strncpy(wifiSsid, ssid, sizeof(wifiSsid) - 1);
  wifiSsid[sizeof(wifiSsid) - 1] = '\0';
  strncpy(wifiPassword, pwd, sizeof(wifiPassword) - 1);
  wifiPassword[sizeof(wifiPassword) - 1] = '\0';
  Serial.printf("[wifi] saved ssid=%s\n", wifiSsid);
  return true;
}

void clearWifiConfig() {
  if (ensureFs()) LittleFS.remove(WIFI_CONFIG_FILE);
  wifiSsid[0] = '\0';
  wifiPassword[0] = '\0';
}

// ========================================
// 班级配置（哈希自己算，用户只输明文）
// ========================================
static bool computeClassHash() {
  if (classPassword[0] == '\0') return false;
  sha256_hex(classPassword, classPasswordHash);
  return true;
}

// 班级 ID 形状：class_ + 数字，长度别超缓冲
static bool classIdLooksOk(const String& id) {
  if (id.length() < 7 || id.length() >= (int)sizeof(classId)) return false;
  if (!id.startsWith("class_")) return false;
  for (size_t i = 6; i < id.length(); ++i) {
    if (id[i] < '0' || id[i] > '9') return false;
  }
  return true;
}

bool loadClassConfig() {
  if (!ensureFs()) return false;
  File f = LittleFS.open(CLASS_CONFIG_FILE, "r");
  if (!f) return false;

  String id  = f.readStringUntil('\n'); id.trim();
  String pwd = f.readStringUntil('\n'); pwd.trim();
  f.close();

  if (!classIdLooksOk(id) || pwd.length() == 0) return false;

  id.toCharArray(classId, sizeof(classId));
  pwd.toCharArray(classPassword, sizeof(classPassword));
  if (!computeClassHash()) return false;

  Serial.printf("[class] loaded id=%s hash=%.8s...\n", classId, classPasswordHash);
  return true;
}

bool saveClassConfig(const char* id, const char* pwd) {
  if (!classIdLooksOk(String(id)) || strlen(pwd) == 0) return false;
  if (strlen(pwd) >= sizeof(classPassword)) return false;
  if (!ensureFs()) return false;

  File f = LittleFS.open(CLASS_CONFIG_FILE, "w");
  if (!f) return false;
  f.print(id);  f.print('\n');
  f.print(pwd); f.print('\n');
  f.close();

  strncpy(classId, id, sizeof(classId) - 1);
  classId[sizeof(classId) - 1] = '\0';
  strncpy(classPassword, pwd, sizeof(classPassword) - 1);
  classPassword[sizeof(classPassword) - 1] = '\0';
  computeClassHash();

  Serial.printf("[class] saved id=%s hash=%.8s...\n", classId, classPasswordHash);
  return true;
}

void clearClassConfig() {
  if (ensureFs()) LittleFS.remove(CLASS_CONFIG_FILE);
  classId[0] = '\0';
  classPassword[0] = '\0';
  classPasswordHash[0] = '\0';
}

// ========================================
// 配网页
// ========================================
static String escapeHtml(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); ++i) {
    char c = in[i];
    switch (c) {
      case '&':  out += "&amp;";  break;
      case '<':  out += "&lt;";   break;
      case '>':  out += "&gt;";   break;
      case '"':  out += "&quot;"; break;
      case '\'': out += "&#39;";  break;
      default:   out += c;        break;
    }
  }
  return out;
}

static const char PAGE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenStu 配置</title>
</head>
<body style="font-family:-apple-system,'PingFang SC',sans-serif;max-width:480px;margin:24px auto;padding:0 16px;">
  <h2>OpenStu 配置</h2>
  <form method="POST" action="/save">
    <h3>WiFi</h3>
    WiFi 名称：<input type="text" name="ssid" maxlength="32" value="%SSID%" required
      style="width:100%;padding:8px;margin:4px 0 12px;"><br>
    WiFi 密码：<input type="password" name="pwd" maxlength="63" placeholder="留空 = 保持原密码"
      style="width:100%;padding:8px;margin:4px 0 16px;"><br>

    <h3>班级</h3>
    班级 ID：<input type="text" name="class_id" maxlength="39" value="%CLASSID%"
      placeholder="class_1780399937423" required
      style="width:100%;padding:8px;margin:4px 0 12px;"><br>
    班级密码：<input type="password" name="class_pwd" maxlength="39" placeholder="留空 = 保持原密码"
      style="width:100%;padding:8px;margin:4px 0 16px;"><br>

    <input type="submit" value="保存并重启" style="width:100%;padding:12px;font-size:16px;">
  </form>
  <p style="color:#888;font-size:13px;line-height:1.6;">
    班级 ID 在网页端地址栏里能看到（形如 <code>class_1780399937423</code>）。<br>
    密码哈希由设备自己计算，不需要手动填 sha256。
  </p>
</body>
</html>
)rawliteral";

// ----------------------------------------
// 开 AP 配网，阻塞到成功或超时
// 成功（两套配置都落盘）返回 true
// ----------------------------------------
bool getWifi() {
  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_AP);
  delay(100);

  bool apOk = (strlen(AP_PASSWORD) >= 8)
                ? WiFi.softAP(AP_SSID, AP_PASSWORD)
                : WiFi.softAP(AP_SSID);
  if (!apOk) {
    Serial.println("[ap] softAP() failed");
    return false;
  }

  String ip = WiFi.softAPIP().toString();
  Serial.printf("[ap] %s started, http://%s\n", AP_SSID, ip.c_str());
  lcdset("AP: OpenStu", ip.c_str());

  ESP8266WebServer server(80);

  bool done  = false;
  bool saved = false;

  server.on("/", HTTP_GET, [&server]() {
    String page = FPSTR(PAGE_HTML);
    page.replace("%SSID%", escapeHtml(String(wifiSsid)));
    page.replace("%CLASSID%", escapeHtml(String(classId)));
    server.send(200, "text/html; charset=utf-8", page);
  });

  server.on("/save", HTTP_POST, [&server, &done, &saved]() {
    String ssid = server.arg("ssid");   ssid.trim();
    String pwd  = server.arg("pwd");    pwd.trim();
    String cid  = server.arg("class_id"); cid.trim();
    String cpwd = server.arg("class_pwd"); cpwd.trim();

    // 长度按字节校验：SSID 上限 32 字节，中文一字 3 字节
    if (ssid.length() == 0 || ssid.length() > 32 || pwd.length() > 63) {
      server.send_P(200, "text/html; charset=utf-8",
        "<meta charset='utf-8'><h3>WiFi 名称或密码不合法</h3>"
        "<p>名称最多 32 字节（约 10 个汉字），密码最多 63 字节。</p><a href='/'>返回</a>");
      return;
    }
    if (!classIdLooksOk(cid)) {
      server.send_P(200, "text/html; charset=utf-8",
        "<meta charset='utf-8'><h3>班级 ID 不合法</h3>"
        "<p>应该形如 class_1780399937423。</p><a href='/'>返回</a>");
      return;
    }

    // 留空 = 沿用已保存的值，方便只改其中一项
    if (pwd.length() == 0 && wifiPassword[0] != '\0')  pwd  = String(wifiPassword);
    if (cpwd.length() == 0 && classPassword[0] != '\0') cpwd = String(classPassword);
    if (cpwd.length() == 0) {
      server.send_P(200, "text/html; charset=utf-8",
        "<meta charset='utf-8'><h3>班级密码不能为空</h3><a href='/'>返回</a>");
      return;
    }

    bool wifiOk  = saveWifiConfig(ssid.c_str(), pwd.c_str());
    bool classOk = saveClassConfig(cid.c_str(), cpwd.c_str());
    saved = wifiOk && classOk;

    server.send_P(200, "text/html; charset=utf-8",
      saved
        ? "<meta charset='utf-8'><h3>保存成功，设备即将重启。</h3>"
          "<p>WiFi 与班级配置都已写入，密码哈希由设备自己算好了。</p>"
        : "<meta charset='utf-8'><h3>写入失败（存储异常），请重试。</h3>");
    done = true;
  });

  server.onNotFound([&server]() {
    server.send(200, "text/html; charset=utf-8",
      "<meta charset='utf-8'><a href='/'>前往配置页面</a>");
  });

  server.begin();

  uint32_t start = millis();
  while (!done && (millis() - start) < AP_TIMEOUT_MS) {
    server.handleClient();
    delay(2);
  }

  if (!done) {
    Serial.println("[ap] config timeout");
    server.stop();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    return false;
  }

  delay(AP_REPLY_DELAY_MS);
  server.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  return saved;
}

#endif // HOMEWORK_WIFI_CONFIG
