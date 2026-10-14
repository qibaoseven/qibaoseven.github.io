#ifndef HOMEWORK_BUTTON_INPUT
#define HOMEWORK_BUTTON_INPUT

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include "screen.h"

// 全局变量：保存 WiFi 名称与密码
char wifiSsid[51];
char wifiPassword[51];

void getWifi() {
  // ---------- 1. 开启 AP 模式，等待用户连接 ----------
  WiFi.mode(WIFI_AP);
  WiFi.softAP("ESP8266-Config");   // 热点名，手机/电脑连上这个热点

  ESP8266WebServer server(80);
  lcdset(WiFi.softAPIP().toString().c_str());

  // 配置网页（存放在 Flash 中）
  static const char PAGE_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WiFi 配置</title>
</head>
<body>
  <h2>请输入 WiFi 名称和密码</h2>
  <form method="POST" action="/save">
    WiFi 名称：<input type="text"     name="ssid" maxlength="50" required><br><br>
    WiFi 密码：<input type="password" name="pwd"  maxlength="50"><br><br>
    <input type="submit" value="保存">
  </form>
</body>
</html>
)rawliteral";

  bool done = false;

  // ---------- 2. 注册路由 ----------
  server.on("/", HTTP_GET, [&server]() {
    server.send_P(200, "text/html", PAGE_HTML);
  });

  server.on("/save", HTTP_POST, [&server, &done]() {
    String ssid = server.arg("ssid");
    String pwd  = server.arg("pwd");

    ssid.toCharArray(wifiSsid, 51);      // 自动补 '\0'
    pwd.toCharArray(wifiPassword, 51);

    server.send_P(200, "text/html",
      "<meta charset='utf-8'><h3>保存成功，设备即将连接该 WiFi。</h3>");
    done = true;
  });

  server.onNotFound([&server]() {
    server.send(200, "text/html",
      "<meta charset='utf-8'><a href='/'>前往配置页面</a>");
  });

  server.begin();

  // ---------- 3. 阻塞等待用户提交 ----------
  while (!done) {
    server.handleClient();
    delay(2);
  }

  // ---------- 4. 收尾：关闭 AP，切回 STA ----------
  delay(100);                   // 等响应数据发完
  server.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);          // 之后可以用 wifiSsid / wifiPassword 去连接
}
#endif