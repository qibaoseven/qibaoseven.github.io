#include "screen.h"

// 唯一一处定义
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

void screeninit() {
  Wire.begin();
  lcd.init();
  lcd.backlight();
}

// 逐字节打印并截到一行宽度：超长会把第二行挤乱，长 SSID 尤其明显
static void printClipped(const char* s) {
  for (int i = 0; s[i] && i < LCD_COLS; ++i) lcd.write((uint8_t)s[i]);
}

void lcdset(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  printClipped(line1);
  lcd.setCursor(0, 1);
  printClipped(line2);
}
