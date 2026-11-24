# OpenStu 硬件端（arduino-hardware-code 分支）

ESP8266 + 读卡芯片 + LCD1602。本版把三个物理按键全部删掉，只保留「刷卡」一种交互。

## 文件

| 文件 | 作用 |
|---|---|
| `homework.ino` | 主固件：自检 → 配网 → 连 WiFi → 轮询读卡 |
| `input.h` | WiFi 配网（无按键版，凭据存 LittleFS） |
| `screen.h` / `screen.cpp` | LCD1602，`screeninit()` 必须在 `setup()` 最开头调用 |
| `cardreader.h` | 读卡统一入口：选驱动、UID 转十六进制/JSON、同卡去重 |
| `cardreader_rc522.h` | RC522（SPI）驱动，**当前硬件** |
| `cardreader_pn532.h` | PN532（I2C）驱动，有预算时换回 |

## 换芯片

`homework.ino` 顶部一行：

```cpp
#define CARD_READER_RC522    // 删掉这行 = PN532
```

## 接线

**RC522（SPI）**

| RC522 | NodeMCU |
|---|---|
| VCC | **3.3V**（5V 会烧） |
| GND | GND |
| SCK | D5 / GPIO14 |
| MISO | D6 / GPIO12 |
| MOSI | D7 / GPIO13 |
| SDA(SS) | D8 / GPIO15 |
| RST | D0 / GPIO16 |
| IRQ | 不接 |

**PN532（I2C，和 LCD 共用总线）**：VCC→3.3V、GND→GND、SDA→D2/GPIO4、SCL→D1/GPIO5。

## 已空出的引脚

| 原按键 | 引脚 | 现在 |
|---|---|---|
| BUTTON1 | GPIO0 | 空出（这个脚低电平会进下载模式，删掉正好） |
| BUTTON2 | GPIO2 | 空出（上电必须为高，本身就不适合挂按键） |
| BUTTON3 | GPIO3 | 空出，**RX 交还串口**，可以用串口发命令了 |

## 配网（无按键）

开机流程：

1. `loadWifiConfig()` 读 LittleFS 的 `/wifi.txt`（两行：SSID、密码）
2. 读不到 → `getWifi()` 开热点 **`OpenStu-Config`**，密码 **`openstu1234`**
3. 手机连上后访问 `http://192.168.4.1/` 填 SSID/密码，保存后设备自动重启
4. 重启后读到凭据 → 连 WiFi；15 秒连不上 → **清空凭据并重启**，自动回到配网（不会像旧版那样空跑）

配网细节：

- 热点起不来（`softAP()` 返回 false）直接重启，不会假装成功
- 3 分钟无人配网自动放弃重启，不再 `while(!done)` 永久卡死
- 响应发完后 `delay(800)` 才拆热点，手机端不会再「提交了但页面报无法访问」
- SSID 为空会被拒绝，提示重填
- AP 名/密码/超时都在 `input.h` 顶部 `#define`，密码少于 8 位会自动降级成开放热点（`""` 即开放）

## 还没接完的部分

`loop()` 里 `readCard` 读到 UID 后目前只打印 + 上屏，`upload` 任务还是空的。下一步是：

```cpp
POST /api/class/{id}/homework/update
{"uid":[18,52,86,120,154,188,222],"target_date":"2026-08-29","subject_id":0}
```

`uidToJson(uid, len, buf)` 已经准备好了，直接拼进请求体即可；服务端会拿 uid 反查学号，返回真实 `student_id`。UID 未绑定则返回 404，需要先 `POST /uuids/add`。
