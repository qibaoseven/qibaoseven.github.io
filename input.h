#ifndef HOMEWORK_WIFI_CONFIG
#define HOMEWORK_WIFI_CONFIG

#include <Arduino.h>
#include <string.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <LittleFS.h>
#include "screen.h"

// ========================================
// WiFi 配网 · 无按键版
// ========================================
// 旧版靠 BUTTON1(GPIO0) 拉高进配网，那个键已经删了。
// 现在改成：开机 loadWifiConfig() 读不到凭据 → 自动开 AP 配网。
// 凭据落在 LittleFS 的 /wifi.txt，重启不再丢。
// ========================================

#define WIFI_CONFIG_FILE   "/wifi.txt"
#define AP_SSID            "OpenStu-Config"
#define AP_PASSWORD        "openstu1234"   // 至少 8 位；改成 "" 就是开放热点
#define AP_TIMEOUT_MS      180000UL        // 3 分钟没人配网就放弃（不再无限阻塞）
#define AP_REPLY_DELAY_MS  800             // 响应必须发完再拆热点，否则手机端报错

char wifiSsid[51]     = {0};
char wifiPassword[51] = {0};

static bool _fsReady = false;

static bool ensureFs() {
  if (_fsReady) return true;
  _fsReady = LittleFS.begin();
  if (!_fsReady) Serial.println("[fs] LittleFS mount failed");
  return _fsReady;
}

// 读回凭据；没有文件或 SSID 为空返回 false（= 需要配网）
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

// 清空凭据：连接超时后调用，下次开机自动回配网
void clearWifiConfig() {
  if (ensureFs()) LittleFS.remove(WIFI_CONFIG_FILE);
  wifiSsid[0] = '\0';
  wifiPassword[0] = '\0';
}

// ----------------------------------------
// 开 AP 配网，阻塞到成功或超时
// 成功（凭据已落盘）返回 true
// ----------------------------------------
bool getWifi() {
  // 先把 STA 彻底断开，避免残留配置把 AP 起在奇怪的信道上
  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_AP);
  delay(100);                 // 等 SDK 真正切完模式，softAP 才不会时好时坏

  bool apOk = (strlen(AP_PASSWORD) >= 8)
                ? WiFi.softAP(AP_SSID, AP_PASSWORD)
                : WiFi.softAP(AP_SSID);
  if (!apOk) {                // 热点起不来就别装没事，直接上报
    Serial.println("[ap] softAP() failed");
    return false;
  }

  String ip = WiFi.softAPIP().toString();
  Serial.printf("[ap] %s started, http://%s\n", AP_SSID, ip.c_str());
  lcdset("AP: OpenStu", ip.c_str());

  ESP8266WebServer server(80);

  static const char PAGE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenStu 配网</title>
</head>
<body>
  <h2>请输入 WiFi 名称和密码</h2>
  <form method="POST" action="/save">
    WiFi 名称：<input type="text"     name="ssid" maxlength="50" required><br><br>
    WiFi 密码：<input type="password" name="pwd"  maxlength="50"><br><br>
    <input type="submit" value="保存">
  </form>
  <p style="color:#666">保存后设备会自动重启并连接。</p>
</body>
</html>
)rawliteral";

  bool done  = false;
  bool saved = false;

  server.on("/", HTTP_GET, [&server]() {
    server.send_P(200, "text/html", PAGE_HTML);
  });

  server.on("/save", HTTP_POST, [&server, &done, &saved]() {
    String ssid = server.arg("ssid");
    String pwd  = server.arg("pwd");
    ssid.trim();
    pwd.trim();

    if (ssid.length() == 0) {
      server.send_P(200, "text/html",
        "<meta charset='utf-8'><h3>WiFi 名称不能为空</h3><a href='/'>返回</a>");
      return;                 // 不置 done，继续等用户重填
    }

    saved = saveWifiConfig(ssid.c_str(), pwd.c_str());
    server.send_P(200, "text/html",
      saved
        ? "<meta charset='utf-8'><h3>保存成功，设备即将重启并连接该 WiFi。</h3>"
        : "<meta charset='utf-8'><h3>写入失败（存储异常），请重试。</h3>");
    done = true;
  });

  server.onNotFound([&server]() {
    server.send(200, "text/html",
      "<meta charset='utf-8'><a href='/'>前往配置页面</a>");
  });

  server.begin();

  // 带超时的等待：没人配网也不会把设备永久卡死在这里
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

  delay(AP_REPLY_DELAY_MS);   // 等浏览器收完响应，避免「提交后页面报无法访问」
  server.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  return saved;
}

#endif // HOMEWORK_WIFI_CONFIG
