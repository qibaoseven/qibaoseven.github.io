#ifndef OPENSTU_CARDREADER_PN532_H
#define OPENSTU_CARDREADER_PN532_H

// ========================================
// PN532 驱动（I2C）
// ========================================
// 依赖库：Adafruit PN532
// 接线（NodeMCU / ESP8266）：
//     PN532 VCC -> 3.3V（模块上 3.3V，接 5V 会烧）
//     PN532 GND -> GND
//     PN532 SDA -> D2 (GPIO4)
//     PN532 SCL -> D1 (GPIO5)
//     I2C 拨码/焊盘切到 I2C 模式，地址固定 0x24
// ========================================

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PN532.h>

#define PN532_SDA_PIN          4
#define PN532_SCL_PIN          5
#define PN532_I2C_CLOCK_HZ     100000UL
#define PN532_POLL_TIMEOUT_MS  80     // 单次寻卡阻塞上限，越小主循环越跟手

// 库版本差异说明：
//   多数 Adafruit_PN532 的 I2C 构造是 (IRQ, RESET)，仓库原 homework.ino 写的是 (SDA, SCL)。
//   如果编译报找不到构造，把下面第 1 行注释掉、改用第 2 行：
//     Adafruit_PN532 pn532(-1, -1);
Adafruit_PN532 pn532(PN532_SDA_PIN, PN532_SCL_PIN);

bool cardBegin() {
  Wire.begin(PN532_SDA_PIN, PN532_SCL_PIN);
  Wire.setClock(PN532_I2C_CLOCK_HZ);

  pn532.begin();
  // 读不到固件版本 = 没通（接线、供电、I2C 模式三处先查）
  if (!pn532.getFirmwareVersion()) return false;

  pn532.SAMConfig();   // 配成 106kbps ISO14443A 读卡模式
  return true;
}

int cardPoll(uint8_t* uid, uint8_t cap) {
  uint8_t buf[CARD_UID_MAX];
  uint8_t len = 0;

  if (!pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A, buf, &len,
                                 PN532_POLL_TIMEOUT_MS)) {
    return 0;                        // 超时即无卡
  }
  if (len == 0 || len > cap) return 0;   // 超过 7 字节的卡后端不收

  memcpy(uid, buf, len);
  return (int)len;
}

// PN532 每次 readPassiveTargetID 都会重新寻卡，不会把卡锁住，
// 这里保持空实现，只为与 RC522 的接口对齐。
void cardRelease() {
}

#endif // OPENSTU_CARDREADER_PN532_H
