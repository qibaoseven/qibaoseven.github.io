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

## 固件行为（v0.46-hw3）

开机：屏亮 → 读卡自检 → 读 WiFi 凭据（没有就 AP 配网）→ 连 WiFi → NTP 授时 → 拉「今天要交哪些科目」。

待机：第一行 `HH:MM:SS`，第二行 `已完成/总数` + 右对齐百分比（`3/12    25%`）。

刷卡流程：

1. 时间无效 → `time not set`，不发请求
2. 不在 `07:00~08:00` → `time error`，不发请求
3. 逐科 POST `/homework/update`，按状态码分流：

| 状态 | 屏幕 |
|---|---|
| 401 | `not this class` |
| 404（UID 未绑定） | `not registered` |
| 409（今天不用交这科） | 试下一科，全都这样显示 `not needed` |
| 200 且 `changed:true` | `sent!`，进度 +1 |
| 200 且 `changed:false`（重复刷） | 试下一科，全交完显示 `already today` |
| 连不上/超时 | `net error` |

多学科：一次刷卡提交一科，同一天再刷一次会把剩下没交的科目补上；服务端用 `changed` 保证不会重复计数。

时间：开机授时一次，之后**每 10 分钟重授一次**（RC 晶振漂移，不重同步会越走越偏）；`configTime(8*3600, 0, ...)` 东八区，无夏令时。

进度分母：`studentCount × required.length`，来自 `GET /api/class/{id}/homework/required`；开机时 `doneItems` 取服务端的 `submitted`，所以重启不会把已完成的清零。

需要改的配置（`homework.ino` 顶部）：

```cpp
#define SERVER_HOST          "os-stu.netlify.app"
#define CLASS_ID             "class_1780399937423"
#define CLASS_PASSWORD       "706"
#define CLASS_PASSWORD_HASH  "sha256(密码)的十六进制"
```

## 依赖的后端接口

| 接口 | 用途 |
|---|---|
| `GET /api/class/{id}/homework/required?date=` | 开机取应交科目、人数、已交条数 |
| `POST /api/class/{id}/homework/update` | 刷卡提交，返回 `changed` 区分首次/重复 |

对应的服务端改动在 `master` 的 `netlify/functions/*` 与 `python/v0.46` 的 `backend/*` 两个分支上，均已实现。

