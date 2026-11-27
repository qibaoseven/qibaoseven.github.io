#include "screen.h"

// 两个常见地址各建一个对象，开机按总线应答选一个
static LiquidCrystal_I2C lcd27(LCD_ADDR, LCD_COLS, LCD_ROWS);
static LiquidCrystal_I2C lcd3f(0x3F, LCD_COLS, LCD_ROWS);

LiquidCrystal_I2C* lcd = &lcd27;

// I2C 扫描：0x27 不应答就试 0x3F，都不应答就退回 0x27
static uint8_t pickLcdAddr() {
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) return 0x27;
  Wire.beginTransmission(0x3F);
  if (Wire.endTransmission() == 0) return 0x3F;
  return 0x27;
}

void screeninit() {
  Wire.begin();
  lcd = (pickLcdAddr() == 0x3F) ? &lcd3f : &lcd27;
  lcd->init();
  lcd->backlight();
}

// 逐字节打印并截到一行宽度：超长会把第二行挤乱，长 SSID 尤其明显
static void printClipped(const char* s) {
  for (int i = 0; s[i] && i < LCD_COLS; ++i) lcd->write((uint8_t)s[i]);
}

void lcdset(const char* line1, const char* line2) {
  lcd->clear();
  lcd->setCursor(0, 0);
  printClipped(line1);
  lcd->setCursor(0, 1);
  printClipped(line2);
}
