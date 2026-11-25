// ========================================
// OpenStu v0.46 · 硬件端主固件
// ESP8266 + RC522（或 PN532）+ LCD1602
// ========================================
// 交互：只有刷卡。
//
// 待机：第一行 HH:MM:SS（NTP 授时），第二行 已完成/总数 + 百分比
// 刷卡：先在 07:00~08:00 窗口里判断，再看服务端返回：
//         401 → not this class
//         409 → not needed
//         404 → not registered
//         200 且 changed=true → sent!，进度 +1
//         200 且 changed=false → already today（同一科重复刷不算数）
// 时间：开机授时，之后每 10 分钟重授一次（RC 晶振漂移，不重同步会越走越偏）
//
// 配置：下面 4 个常量必须按你的班级改。HASH 用
//     printf '密码' | sha256sum
// ========================================
#define CARD_READER_RC522

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include "cardreader.h"
#include "input.h"

// ---------- 服务器 ----------
// 班级 ID / 密码不再写死：配网页里填，设备自己算 sha256(密码)
#define SERVER_HOST          "os-stu.netlify.app"

// ---------- 行为参数 ----------
#define SUBMIT_HOUR_START    7           // 07:00 开始收
#define SUBMIT_HOUR_END      8           // 08:00 之后不再收，窗口 = [07:00, 08:00)
#define NTP_RESYNC_MS        (10UL * 60UL * 1000UL)
#define REQUIRED_REFRESH_MS  (30UL * 60UL * 1000UL)
#define REQUIRED_RETRY_MS    (60UL * 1000UL)
#define STATUS_HOLD_MS       3000UL
#define HTTP_TIMEOUT_MS      5000
#define CARD_SUBJECT_MAX     16          // 学科数上限，超过只取前 16 科
#define TIME_VALID_EPOCH     1600000000UL  // 2020-09 之后才算授时成功

static uint8_t  requiredList[CARD_SUBJECT_MAX];
static int      requiredCount = 0;
static int      totalItems    = 0;        // = 学生数 × 应交科目数
static int      doneItems     = 0;        // 已完成条数
static uint32_t statusUntil   = 0;        // 0 = 显示时钟
static uint32_t lastClockMs   = 0;
static uint32_t lastNtpMs     = 0;
static uint32_t lastFetchMs   = 0;

// ========================================
// 时间
// ========================================
static void ntpStart() {
  // 东八区，无夏令时；三个服务器，单个挂了也能授上
  configTime(8 * 3600, 0, "ntp.aliyun.com", "ntp.tencent.com", "pool.ntp.org");
}

static bool getLocalTime(struct tm* out) {
  time_t now = time(nullptr);
  if (now < (time_t)TIME_VALID_EPOCH) return false;
  localtime_r(&now, out);
  return true;
}

static bool waitForTime(uint16_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    if (time(nullptr) >= (time_t)TIME_VALID_EPOCH) return true;
    delay(200);
  }
  return false;
}

static bool inSubmitWindow(const struct tm& t) {
  return t.tm_hour >= SUBMIT_HOUR_START && t.tm_hour < SUBMIT_HOUR_END;
}

static void todayString(char* out, size_t cap) {
  struct tm t;
  if (!getLocalTime(&t)) { snprintf(out, cap, "1970-01-01"); return; }
  strftime(out, cap, "%Y-%m-%d", &t);
}

// ========================================
// 屏幕
// ========================================
static void buildProgress(char* out, size_t cap) {
  char left[12];
  snprintf(left, sizeof(left), "%d/%d", doneItems, totalItems);

  int pct = totalItems > 0 ? (int)(((long)doneItems * 100L) / totalItems) : 0;
  char right[8];
  snprintf(right, sizeof(right), "%d%%", pct);

  int pad = LCD_COLS - (int)strlen(left) - (int)strlen(right);
  if (pad < 1) pad = 1;
  snprintf(out, cap, "%s%*s%s", left, pad, "", right);
}

static void showClock() {
  struct tm t;
  char line1[10];
  if (getLocalTime(&t)) strftime(line1, sizeof(line1), "%H:%M:%S", &t);
  else                   strcpy(line1, "time sync..");

  char line2[17];
  buildProgress(line2, sizeof(line2));
  lcdset(line1, line2);
}

static void showMessage(const char* msg) {
  char line2[17];
  buildProgress(line2, sizeof(line2));
  lcdset(msg, line2);
  statusUntil = millis() + STATUS_HOLD_MS;
}

// ========================================
// 网络：取应交科目 / 提交一条
// ========================================
// 返回 HTTP 状态码：0 = 成功，401/4xx = 服务端拒绝，<0 = 没连上
static int fetchRequired() {
  if (classId[0] == '\0') return -1;

  char date[11];
  todayString(date, sizeof(date));

  char url[192];
  snprintf(url, sizeof(url),
           "https://%s/api/class/%s/homework/required?date=%s",
           SERVER_HOST, classId, date);

  WiFiClientSecure client;
  client.setInsecure();                 // 没带根证书，省 RAM；校园内网够用
  client.setBufferSizes(1024, 1024);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) return -1;
  http.addHeader("X-Password", classPassword);
  http.addHeader("X-Password-Hash", classPasswordHash);

  int code = http.GET();
  if (code != 200) { http.end(); return code; }

  String payload = http.getString();
  http.end();                            // 连接立刻释放，别占着 RAM

  int studentCount = 0;
  const char* p = strstr(payload.c_str(), "\"studentCount\"");
  if (p) { p = strchr(p, ':'); if (p) studentCount = atoi(p + 1); }

  int submitted = 0;
  p = strstr(payload.c_str(), "\"submitted\"");
  if (p) { p = strchr(p, ':'); if (p) submitted = atoi(p + 1); }

  requiredCount = 0;
  p = strstr(payload.c_str(), "\"required\"");
  if (p) {
    p = strchr(p, '[');
    if (p) {
      ++p;
      while (*p && *p != ']' && requiredCount < CARD_SUBJECT_MAX) {
        while (*p == ' ' || *p == ',') ++p;
        if (!*p || *p == ']') break;
        int v = atoi(p);
        if (v >= 0 && v < 255) requiredList[requiredCount++] = (uint8_t)v;
        while (*p && *p != ',' && *p != ']') ++p;
      }
    }
  }

  totalItems = studentCount * requiredCount;
  doneItems  = submitted;                // 以服务端为准：重启后不会重复计数
  if (doneItems > totalItems) doneItems = totalItems;

  Serial.printf("[hw] date=%s students=%d required=%d submitted=%d total=%d\n",
                date, studentCount, requiredCount, submitted, totalItems);
  return 0;
}

// 返回 HTTP 状态码；<=0 表示没连上/超时
static int postUpdate(const uint8_t* uid, uint8_t len, uint8_t subjectId, bool* changed) {
  char uidJson[4 * CARD_UID_MAX + 4];
  uidToJson(uid, len, uidJson);

  char date[11];
  todayString(date, sizeof(date));

  char body[96];
  snprintf(body, sizeof(body),
           "{\"uid\":%s,\"target_date\":\"%s\",\"subject_id\":%u}",
           uidJson, date, subjectId);

  char url[160];
  snprintf(url, sizeof(url), "https://%s/api/class/%s/homework/update", SERVER_HOST, classId);

  WiFiClientSecure client;
  client.setInsecure();
  client.setBufferSizes(1024, 1024);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Password", classPassword);
  http.addHeader("X-Password-Hash", classPasswordHash);

  int code = http.POST((uint8_t*)body, strlen(body));
  *changed = false;

  if (code == 200) {
    String payload = http.getString();
    *changed = strstr(payload.c_str(), "\"changed\":true") != nullptr;
  }
  http.end();                            // 请求体/响应立刻丢掉，不驻留内存
  return code;
}

// ========================================
// 刷卡
// ========================================
static void handleCard(const uint8_t* uid, uint8_t len) {
  struct tm t;
  if (!getLocalTime(&t))   { showMessage("time not set"); return; }
  if (!inSubmitWindow(t))  { showMessage("time error");   return; }
  if (requiredCount == 0)  { showMessage("not needed");   return; }

  // 逐科尝试：服务端用 changed 告诉我们这一科是不是今天第一次交
  bool sawRejected = false;
  for (int i = 0; i < requiredCount; ++i) {
    bool changed = false;
    int code = postUpdate(uid, len, requiredList[i], &changed);

    if (code == 401) { showMessage("not this class"); return; }
    if (code == 404) { showMessage("not registered"); return; }
    if (code == 409) { sawRejected = true; continue; }   // 这科今天不用交，试下一科
    if (code != 200) { showMessage("net error"); return; }

    if (changed) {
      if (doneItems < totalItems) ++doneItems;
      showMessage("sent!");
      return;
    }
  }

  showMessage(sawRejected ? "not needed" : "already today");
}

// ========================================
// 开机
// ========================================
static bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.begin(wifiSsid, wifiPassword);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start >= 15UL * 1000UL) {
      Serial.printf("[wifi] connect timeout, status=%d\n", (int)WiFi.status());
      return false;
    }
    delay(30);
  }
  Serial.print("[wifi] ip=");
  Serial.println(WiFi.localIP());
  return true;
}

void setup() {
  screeninit();
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("=== OpenStu card reader ===");

  lcdset("OpenStu boot", "");

  // 1) 读卡芯片
  if (!cardBegin()) {
    lcdset("Card init failed");
    Serial.println("[card] init failed, reboot in 3s");
    delay(3000);
    ESP.restart();
  }

  // 2) 配网：WiFi 或班级配置任一缺失，就开 AP 一次性补齐
  if (!loadWifiConfig() || !loadClassConfig()) {
    lcdset("Config AP mode", "wifi + class");
    Serial.println("[cfg] missing wifi or class config, entering AP");
    if (!getWifi()) {
      lcdset("Config failed");
      delay(3000);
      ESP.restart();
    }
    delay(500);
    ESP.restart();
  }

  if (!connectWifi()) {
    lcdset("WiFi time out", "back to config");
    delay(2000);
    clearWifiConfig();
    ESP.restart();
  }

  // 3) NTP 授时
  lcdset("Time sync", "");
  ntpStart();
  if (!waitForTime(20000)) {
    Serial.println("[ntp] sync timeout, will retry in loop");
  }

  // 4) 拉今天要交哪些科目
  lcdset("Loading homework", "");
  int rc = fetchRequired();
  if (rc == 401) {
    // 班级 ID 或密码不对：清掉班级配置，重启后重新配
    lcdset("Class config bad", "re-enter");
    Serial.println("[hw] 401 from server, class config rejected");
    clearClassConfig();
    delay(3000);
    ESP.restart();
  } else if (rc != 0) {
    lcdset("No homework data", "retry later");
  } else if (requiredCount == 0) {
    lcdset("No homework today", "");
  } else {
    showClock();
  }

  lastNtpMs   = millis();
  lastFetchMs = millis();
  lastClockMs = 0;
  statusUntil = 0;
}

void loop() {
  uint32_t now = millis();

  // 定期重授时：RC 晶振会漂，必须持续校
  if (now - lastNtpMs >= NTP_RESYNC_MS) {
    lastNtpMs = now;
    ntpStart();
  }

  // 定期刷新「今天要交哪些科目」；没数据就 1 分钟重试
  uint32_t refresh = (totalItems > 0) ? REQUIRED_REFRESH_MS : REQUIRED_RETRY_MS;
  if (now - lastFetchMs >= refresh) {
    lastFetchMs = now;
    if (WiFi.status() == WL_CONNECTED) {
      int rc = fetchRequired();
      if (rc == 401) {
        // 班级凭据被拒（改了班级密码之类）：清配置，回配网重填
        showMessage("class config bad");
        clearClassConfig();
        delay(2000);
        ESP.restart();
      }
    }
  }

  // 状态消息到期回时钟
  if (statusUntil && (int32_t)(now - statusUntil) >= 0) statusUntil = 0;
  if (!statusUntil && (now - lastClockMs >= 1000UL)) {
    lastClockMs = now;
    showClock();
  }

  // 刷卡
  uint8_t uid[CARD_UID_MAX];
  uint8_t len = 0;
  if (cardReadNew(uid, len, 3000)) {
    char hex[3 * CARD_UID_MAX + 1];
    uidToHex(uid, len, hex);
    Serial.printf("[card] uid=%s\n", hex);
    handleCard(uid, len);
    lastClockMs = now;
  }

  delay(10);
}
