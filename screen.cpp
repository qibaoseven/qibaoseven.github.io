#include "screen.h"

// 唯一一处定义
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

void screeninit() {
  Wire.begin();
  lcd.init();
  lcd.backlight();
}

void lcdset(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}
