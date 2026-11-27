#ifndef HOMEWORK_SCREEN_H
#define HOMEWORK_SCREEN_H

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// LCD1602 + I2C 转接板。常见地址 0x27 或 0x3F；
// 固件开机时会自动探测，取先应答的那个（都不用改代码）
#define LCD_ADDR 0x27
#define LCD_COLS 16
#define LCD_ROWS 2

// 对象定义在 screen.cpp，这里只做声明，避免多编译单元重复定义
// 用指针是为了开机时自动识别 0x27 / 0x3F 两种常见转接板地址
extern LiquidCrystal_I2C* lcd;

// 必须在 setup() 最开始调用一次
void screeninit();

void lcdset(const char* line1, const char* line2 = "");

#endif
