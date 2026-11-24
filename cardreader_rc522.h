#ifndef OPENSTU_CARDREADER_RC522_H
#define OPENSTU_CARDREADER_RC522_H

// ========================================
// RC522 驱动（SPI）
// ========================================
// 依赖库：MFRC522（GithubCommunity / miguelbalboa，1.4.x 以上）
// 接线（NodeMCU / ESP8266，硬件 SPI 固定脚）：
//     RC522 VCC -> 3.3V（RC522 是 3.3V 器件，5V 会烧）
//     RC522 GND -> GND
//     RC522 SCK  -> D5 (GPIO14)
//     RC522 MISO -> D6 (GPIO12)
//     RC522 MOSI -> D7 (GPIO13)
//     RC522 SDA(SS) -> D8 (GPIO15)
//     RC522 RST  -> D0 (GPIO16)
//     RC522 IRQ  -> 不接
// 注意：GPIO15 上电瞬间必须为低电平（板载下拉电阻负责），否则 ESP8266 不进 boot。
// ========================================

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>

#define RC522_SS_PIN   15     // D8
#define RC522_RST_PIN  16     // D0

MFRC522 rc522(RC522_SS_PIN, RC522_RST_PIN);

// 让卡进入 HALT 并结束加密通信，读下一张卡时不会被上一张挡住
void cardRelease() {
  rc522.PICC_HaltA();
  rc522.PCD_StopCrypto1();
}

bool cardBegin() {
  SPI.begin();
  rc522.PCD_Init();
  delay(10);              // 等天线起振

  // VersionReg：0x91/0x92 = MFRC522 正常应答；0x00/0xFF = 没通或供电不足
  uint8_t version = rc522.PCD_ReadRegister(MFRC522::VersionReg);
  if (version == 0x00 || version == 0xFF) return false;

  rc522.PCD_AntennaOn();
  // 便宜模块天线小，增益直接拉满。老版库若报 PCD_SetAntennaGain 不存在，删掉这一行即可。
  rc522.PCD_SetAntennaGain(MFRC522::RxGain_max);
  return true;
}

int cardPoll(uint8_t* uid, uint8_t cap) {
  // 没有新卡就立刻返回，不阻塞主循环
  if (!rc522.PICC_IsNewCardPresent()) return 0;
  if (!rc522.PICC_ReadCardSerial()) return 0;     // 读 UID 失败：卡刚被拿开之类的抖动

  uint8_t len = rc522.uid.size;                   // 常见 4 字节（MIFARE Classic）/ 7 字节（NTAG）
  if (len == 0 || len > cap) {                    // 10 字节的长 UID 卡后端不收，直接放过
    cardRelease();
    return 0;
  }

  memcpy(uid, rc522.uid.uidByte, len);
  cardRelease();
  return (int)len;
}

#endif // OPENSTU_CARDREADER_RC522_H
