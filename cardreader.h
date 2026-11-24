#ifndef OPENSTU_CARDREADER_H
#define OPENSTU_CARDREADER_H

#include <Arduino.h>
#include <string.h>

// ========================================
// OpenStu 读卡驱动 · 统一入口
// ========================================
// 两套驱动共用同一组函数，换芯片只改一个宏：
//   · PN532（有预算）：I2C，SDA=GPIO4、SCL=GPIO5，与 LCD1602 共用总线
//   · RC522（贪便宜）：SPI，SS=GPIO15、RST=GPIO16
//
// 用法：在 .ino 最顶部（#include 之前）写下一行，或者什么都不写用默认的 PN532
//     #define CARD_READER_RC522
// ========================================

#if !defined(CARD_READER_PN532) && !defined(CARD_READER_RC522)
#define CARD_READER_PN532            // 不选就默认 PN532
#endif

#if defined(CARD_READER_PN532) && defined(CARD_READER_RC522)
#error "CARD_READER_PN532 与 CARD_READER_RC522 只能启用一个"
#endif

// 后端 /uuids 与 /homework/update 只接受 1~7 字节，超过 7 字节的卡这里直接忽略
#define CARD_UID_MAX 7

#if defined(CARD_READER_PN532)
#include "cardreader_pn532.h"
#elif defined(CARD_READER_RC522)
#include "cardreader_rc522.h"
#endif

// ----------------------------------------
// 统一接口（两个驱动各实现一份，签名完全一致）
// ----------------------------------------
// bool cardBegin();
//    初始化总线与芯片，芯片应答正常返回 true
// int  cardPoll(uint8_t* uid, uint8_t cap);
//    轮询一次：>0 = 读到卡并返回 UID 长度；0 = 这次没卡；-1 = 硬件错误
// void cardRelease();
//    释放/停机，避免同一张卡被立刻重复读到

// ----------------------------------------
// 公共小工具
// ----------------------------------------

// UID -> "12:34:56:78:9A:BC:DE"（串口、LCD 用）。out 至少 3*CARD_UID_MAX+1 字节
static inline void uidToHex(const uint8_t* uid, uint8_t len, char* out) {
  out[0] = '\0';
  for (uint8_t i = 0; i < len; ++i) {
    if (i) strcat(out, ":");
    char b[4];
    snprintf(b, sizeof(b), "%02X", uid[i]);
    strcat(out, b);
  }
}

// UID -> "[18,52,86,120,154,188,222]"（直接拼进 /homework/update 的请求体）
// out 至少 4*CARD_UID_MAX+4 字节
static inline void uidToJson(const uint8_t* uid, uint8_t len, char* out) {
  out[0] = '\0';
  strcat(out, "[");
  for (uint8_t i = 0; i < len; ++i) {
    if (i) strcat(out, ",");
    char b[6];
    snprintf(b, sizeof(b), "%u", uid[i]);
    strcat(out, b);
  }
  strcat(out, "]");
}

// 轮询 + 同一张卡去重。holdMs 内重复扫到同一张卡只上报一次。
// 返回 true 时 len 为 UID 长度；uid 内容即该卡 UID。
static inline bool cardReadNew(uint8_t* uid, uint8_t& len, uint32_t holdMs = 3000) {
  static uint8_t lastUid[CARD_UID_MAX];
  static uint8_t lastLen = 0;
  static uint32_t lastMs = 0;

  int n = cardPoll(uid, CARD_UID_MAX);
  if (n <= 0) return false;              // 0 = 无卡，-1 = 硬件错误

  uint32_t now = millis();
  if ((uint8_t)n == lastLen && memcmp(uid, lastUid, n) == 0
      && (uint32_t)(now - lastMs) < holdMs) {
    len = (uint8_t)n;
    return false;                        // 冷却期内：同一张卡，不重复上报
  }

  memcpy(lastUid, uid, n);
  lastLen = (uint8_t)n;
  lastMs = now;
  len = (uint8_t)n;
  return true;
}

#endif // OPENSTU_CARDREADER_H
