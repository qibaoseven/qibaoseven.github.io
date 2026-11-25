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

1. `loadWifiConfig()` 读 `/wifi.txt`（两行：SSID、密码），`loadClassConfig()` 读 `/class.txt`（两行：班级 ID、班级密码）
2. **任一缺失** → `getWifi()` 开热点 **`OpenStu-Config`**，密码 **`openstu1234`**
3. 手机连上后访问 `http://192.168.4.1/`，一页填完 WiFi + 班级四项
4. **保存后刷一次卡** → 设备退出配网、重启、连 WiFi 开始工作（不刷卡就一直停在配网页）
5. 重启后 15 秒连不上 WiFi → **清空 WiFi 凭据并重启**，自动回到配网

配网细节：

- 热点起不来（`softAP()` 返回 false）直接重启，不会假装成功
- **没有超时**：热点一直开着，随便你改几次。第一张卡刷上来才算确认 —— 这是为了防手残：改到一半不会被打断
- 刷卡即锁定：退出配网后配置就固定了，要重配必须按 RST 回到配网
- 还没保存成功就刷卡不算确认，屏幕提示 `Card seen / save first`，热点继续开
- 轮询读卡间隔 20 ms，配网页照样能秒开（`cardPoll` 本身不阻塞）
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

需要改的配置：只剩服务器地址（`homework.ino` 顶部）

```cpp
#define SERVER_HOST  "os-stu.netlify.app"
```

班级 ID、班级密码**不再写死在源码里**，改到配网页里填（见下一节）。

## 配网页（WiFi + 班级，一次填完）

开机时只要 **WiFi 凭据或班级配置任一缺失**，就自动开热点 `OpenStu-Config`（密码 `openstu1234`），手机连上访问 `http://192.168.4.1/`，一页填四项：

| 字段 | 说明 |
|---|---|
| WiFi 名称 | 必填，最多 32 字节（约 10 个汉字） |
| WiFi 密码 | 留空 = 沿用已保存的值 |
| 班级 ID | 必填，形如 `class_1780399937423`，网页端地址栏里能复制 |
| 班级密码 | 留空 = 沿用；**明文保存，哈希设备自己算** |

保存后：`/wifi.txt` 存 WiFi，`/class.txt` 存班级 ID + 明文密码，`sha256.h` 在需要时算出 `sha256(密码)` 用于 `X-Password-Hash`。用户不需要知道哈希是什么。**保存不等于退出，刷一次卡才退出并锁定。**

开机连上后会先拉一次 `required`：如果返回 **401**，说明班级 ID 或密码不对，设备会清掉班级配置（保留 WiFi）、重启回配网页重填，屏幕提示 `Class config bad`。

## 编译（已实测通过）

已在 `arduino-cli 1.6.0` + `esp8266:esp8266@3.1.2` 上编译通过（RC522 与 PN532 两个变体都过，零编译警告）：

```bash
arduino-cli core install esp8266:esp8266 \
  --additional-urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli lib install "MFRC522" "Adafruit PN532" "LiquidCrystal I2C"
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 homework   # 目录名需为 homework
```

**1MB 板子用这个 FQBN**（重要：`nodemcuv2` 这个板型没有 1MB 选项，要选 `generic`）：

```bash
arduino-cli compile --fqbn esp8266:esp8266:generic:eesz=1M64 homework
```

`1M64` = 1MB Flash、文件系统 64KB。对应布局：代码区到 `0xEB000`（`irom0_0_seg` 长度 `0xe9ff0` ≈ 936KB），文件系统 `0xEB000~0xFB000`（正好 64KB，块 4KB），最后 `0xFC000` 放 RF 校准。当前固件 470544 字节，占代码区一半，64KB 的文件系统存两个几百字节的配置文件绰绰有余。Arduino IDE 里对应选 **Generic ESP8266 Module / 1MB (FS:64KB OTA:~470KB)**。

占用（`nodemcuv2` 与 `generic:eesz=1M64` 代码量一致，1MB flash / 80KB RAM）：

| 项 | 用量 |
|---|---|
| RAM（全局） | 33412 / 80192 字节（41%） |
| IRAM | 28755 / 65536（93%，含 32KB cache 预留，属正常） |
| Flash 代码 | 430,952 字节；1M64 布局的实际上限是 958,448（约 936KB），占 45%，bin 470,544 字节 |

注意两点：`homework.ino` 里的本地取时函数必须叫 `readLocalTime`（原名 `getLocalTime` 会和 ESP8266 core 的 `getLocalTime(tm*, ms)` 二义性冲突）；`LiquidCrystal I2C` 库标注只支持 AVR，编译有 architecture 提示但不影响 ESP8266 使用。

## 本地联调（真后端，已实测通过）

固件已在主机侧用桩件接**本地 python/v0.46 Flask** 跑过端到端（不是只看编译）：

| 场景 | 结果 |
|---|---|
| 无配置开机 → AP 配网（未保存就刷卡） | `Card seen / save first`，热点不断 |
| 保存 → 刷卡确认 | `Config locked` → 重启 → 连 WiFi |
| 开机拉 required | `30 人 × 2 科 = 60`，`0/60 0%` |
| 1 号刷卡 | `POST update → 200 changed:true` → `sent!` `1/60 1%` |
| 服务端改成只交数学，2 号刷卡 | 科0 `409` → 科1 `200 changed:true` → `sent!` `2/60 3%` |
| 3 号刷卡 | `sent!` `3/60 5%`；服务端 `submitted` 也为 3，库里三人记录正确 |
| 未绑定卡 | `404 UID_NOT_BOUND` → `not registered` |
| 08:10 刷卡 | `time error`，服务端日志无请求 |
| 班级密码填错 → 401 | `Class config bad` → 清班级配置 → 回配网重填 706 → 正常 `sent!` |

仿真器在 `firmware-sim/`，跑真后端的命令写在它的 README 里。

## 依赖的后端接口

| 接口 | 用途 |
|---|---|
| `GET /api/class/{id}/homework/required?date=` | 开机取应交科目、人数、已交条数 |
| `POST /api/class/{id}/homework/update` | 刷卡提交，返回 `changed` 区分首次/重复 |

对应的服务端改动在 `master` 的 `netlify/functions/*` 与 `python/v0.46` 的 `backend/*` 两个分支上，均已实现。

