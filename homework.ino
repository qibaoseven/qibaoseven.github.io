// ========================================
// OpenStu v0.46 · 硬件端主固件
// ESP8266 + RC522（或 PN532）+ LCD1602
// ========================================
// 本期变更：
//   · 三个物理按键（GPIO0/2/3）全部移除，只保留读卡交互
//   · 配网改为「开机无凭据自动开 AP」，凭据存 LittleFS，重启不丢
//   · 连接失败不再空跑：清凭据 → 重启 → 自动回到配网
// ========================================
// 芯片二选一：当前硬件是 RC522，改注释即可换回 PN532
//     PN532：注释掉下一行
//     RC522：保留
#define CARD_READER_RC522

#include <ESP8266WiFi.h>
#include "cardreader.h"
#include "input.h"

class queue {
  unsigned head = 0, tail = 0;
  static const unsigned short MAX_QUEUE_SIZE = 50;
  unsigned short array[MAX_QUEUE_SIZE + 5];
public:
  inline bool isEmpty() const { return head == tail; }
  inline bool isFull() const { return (tail + 1) % MAX_QUEUE_SIZE == head; }
  inline unsigned short front() { return array[head]; }
  bool push(const unsigned short& data) {
    if (isFull()) return false;
    array[tail] = data;
    tail = (tail + 1) % MAX_QUEUE_SIZE;
    return true;
  }
  bool pop() {
    if (isEmpty()) return false;
    head = (head + 1) % MAX_QUEUE_SIZE;
    return true;
  }
} task;

// 按键相关的 button1/button2/button3 已删除
enum Taskname {
  readCard,
  screenFlush,
  screenMainPage,
  upload,
  res,
  TASK_COUNT
};
unsigned long long delayTime[TASK_COUNT];

int64_t now = 0;
const int64_t SECOND = 1000;

void wifiFailed();

// LCD1602 是 HD44780 字库，只有 ASCII/日文片假名，没有汉字点阵。
// 中文 SSID 直接上屏必然是乱码，这里降级成提示文本，真实名字走串口。
static void lcdShowConnecting() {
  bool ascii = true;
  for (size_t i = 0; wifiSsid[i]; ++i) {
    if ((unsigned char)wifiSsid[i] >= 0x80) { ascii = false; break; }
  }
  if (ascii) lcdset("Connect Wifi", wifiSsid);
  else       lcdset("Connect Wifi", "SSID: non-ASCII");
  Serial.printf("[wifi] connecting to \"%s\"\n", wifiSsid);
}

void setup() {
  screeninit();               // 先把屏点亮：旧版从没调用过，屏上提示全是花屏

  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("=== OpenStu hardware boot ===");

  // ---------- 1. 读卡芯片自检 ----------
  if (!cardBegin()) {
    lcdset("Card init failed");
    Serial.println("[card] init failed, reboot in 3s");
    delay(3000);
    ESP.restart();
  }
  Serial.println("[card] reader ready");

  // ---------- 2. WiFi 配网（无按键：没凭据就自动进 AP） ----------
  if (!loadWifiConfig()) {
    lcdset("Config AP mode", "no wifi saved");
    Serial.println("[wifi] no credentials, entering AP config");
    if (!getWifi()) {
      lcdset("Config failed");
      Serial.println("[wifi] AP config failed, reboot in 3s");
      delay(3000);
      ESP.restart();
    }
    delay(500);
    ESP.restart();            // 凭据已落盘，重启走正常连接
  }

  // ---------- 3. 连接 WiFi ----------
  lcdShowConnecting();
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.begin(wifiSsid, wifiPassword);

  now = millis();
  while (WiFi.status() != WL_CONNECTED) {     // 不再用 WL_IDLE_STATUS 判断
    if (millis() - now >= 15 * SECOND) {
      lcdset("WiFi time out", "back to config");
      wifiFailed();              // 串口里留下具体原因（SSID 不存在/密码错/掉线）
      Serial.println("[wifi] connect timeout, clearing credentials");
      delay(2000);
      clearWifiConfig();        // 坏凭据作废，重启后自动回配网
      ESP.restart();
    }
    delay(30);
  }

  String ip = WiFi.localIP().toString();
  Serial.print("[wifi] connected, ip=");
  Serial.println(ip);
  lcdset("Reader ready", ip.c_str());

  task.push(readCard);
  delayTime[readCard] = millis() + 100;
}

void loop() {
  now = millis();

  switch (task.front()) {
    case res:
      ESP.restart();
      break;

    case readCard: {
      if (now < delayTime[readCard]) break;

      uint8_t uid[CARD_UID_MAX];
      uint8_t len = 0;

      // 同一张卡 3 秒内只上报一次
      if (cardReadNew(uid, len, 3000)) {
        char hex[3 * CARD_UID_MAX + 1];
        uidToHex(uid, len, hex);
        Serial.printf("[card] uid=%s\n", hex);
        lcdset("Card read", hex);
        // TODO: 接 POST /api/class/{id}/homework/update，body 用 uidToJson()
      }

      delayTime[readCard] = millis() + 120;
      break;
    }

    default:
      delay(10);
      break;
  }
}

// 只在串口打印诊断信息，不再写屏（屏上信息由 setup/loop 决定）
void wifiFailed() {
  switch (WiFi.status()) {
    case WL_NO_SSID_AVAIL:      Serial.println("[wifi] SSID not found");  break;
    case WL_CONNECT_FAILED:     Serial.println("[wifi] connect failed");  break;
    case WL_WRONG_PASSWORD:     Serial.println("[wifi] wrong password");  break;
    case WL_CONNECTION_LOST:    Serial.println("[wifi] connection lost"); break;
    case WL_CONNECTED:          return;
    default:                    Serial.println("[wifi] failed");          break;
  }
}
