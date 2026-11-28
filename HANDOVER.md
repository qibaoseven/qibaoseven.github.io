# OpenStu 多端客户端 交接文档

> 本文件放在 master 分支根目录，供接手者快速了解「网页端之外的所有客户端」做到哪一步、还差什么、怎么编译、有哪些坑。

## 1. 目标

把 OpenStu（班级交作业 / 积分系统）的**所有非网页端客户端**做到与网页端：

- 功能对齐（每个页面、每个按钮、每个写操作）；
- 使用逻辑一致（数据流都是「GET 整班 → 本地改 → POST 覆盖」）；
- 内容相同（字段、统计口径、日志文案、兑换率等都读同一份数据，不另造）；
- 样式基本一致（允许因设备屏幕/终端能力造成的布局差异）。

网页端是唯一标准，判断依据永远是 `js/pages/*.js`、`js/data.js`、`js/utils.js`。

## 2. 仓库与分支

| 分支 | 工作树 | 内容 |
|---|---|---|
| `master` | `/tmp/wt-web` | 网页端 + 本文档 |
| `native-clients` | `/tmp/wt-clients` | CLI(Python/C++)、Android、Swift、鸿蒙、Qt/KDE、CI |
| `arduino-hardware-code` | `/tmp/wt-hw` | ESP8266 固件 |

远端别名 `qibaoseven-gh`，仓库 `qibaoseven/qibaoseven.github.io`。

> 注：`/tmp/` 下的工作树是临时目录，重启后可能消失，用 `git worktree add` 重新挂即可，代码都在远端分支上。

## 3. 目录结构（native-clients 分支）

```
clients/
├── README.md                 六端总览 + CI 说明
├── FEATURES.md               页面 × 端 功能矩阵（权威进度表）
├── linux-cli/                C++ CLI（main.cpp / classcmd.hpp / info.hpp / json.hpp / http.hpp / sha256.h / Makefile）
├── python-cli/               Python CLI（openstu.py，纯标准库）
├── android/                  Kotlin + Compose（Ui.kt / MorePages.kt / Api.kt / DevicePage.kt）
├── swift/                    xcodegen 工程，Shared/ 一份代码供 iOS/macOS/tvOS/watchOS/visionOS
│   ├── Shared/{ApiClient,AppModel,DeviceView,SettingsView,MoreView,MacSerial}.swift
│   └── project.yml
├── harmony/                  ArkTS（model/Api.ets、model/Store.ets、pages/Index.ets、pages/MoreSheet.ets）
├── common-cpp/               Qt/KDE 共用（OpenStuApi、OpenStuWindow、OpenStuMoreDialog）
├── qt-windows/               Qt6 前端
└── linux-kde/                KF6 前端（找不到 KF6 自动降级纯 Qt）
.github/workflows/build-native.yml   CI
```

## 4. 各端编译方法

**C++ CLI**

```bash
cd clients/linux-cli && make          # 产物 openstu-cli，无第三方依赖
```

**Python CLI**

```bash
python3 clients/python-cli/openstu.py help
# 配置：~/.config/openstu-cli/config.json（Windows 为 %APPDATA%\openstu-cli\config.json）
```

**Android**

```bash
cd clients/android && ./gradlew assembleDebug   # 无 wrapper，CI 用 gradle-version 8.7
```

**Swift**

```bash
cd clients/swift && xcodegen generate
xcodebuild -project OpenStu.xcodeproj -scheme OpenStuIOS -destination 'generic/platform=iOS' build
```

部署目标：iOS 16 / macOS 13 / tvOS 17 / watchOS 10 / visionOS 1.0。

**鸿蒙**

需要 DevEco Studio（或 commandline-tools）：
`hvigorw assembleHap --mode module -p product=default -p buildMode=debug`

**Qt / KDE**

```bash
cmake -S clients/qt-windows -B /tmp/qbuild && cmake --build /tmp/qbuild -j4
cmake -S clients/linux-kde  -B /tmp/kbuild && cmake --build /tmp/kbuild -j4
```

`common-cpp` 路径在 CMake 里必须是 `${CMAKE_CURRENT_SOURCE_DIR}/../common-cpp`；`OPENSTU_WITH_KDE` 探测失败会降级纯 Qt，两套都能编。

## 5. CI（`.github/workflows/build-native.yml`）

job：`cli` / `python-cli` / `qt` / `android` / `swift-macos` / `swift-ios` / `harmony` / `release`。

- `release` 依赖 cli+python-cli+qt+android+swift-macos，产物挂 `native-latest`。
- `swift-ios` 只做编译验证（`CODE_SIGNING_ALLOWED=NO` 出的是未签名 .app，装不上真机）。要出 .ipa 必须在 Secrets 配开发者证书 `.p12`、描述文件 `.mobileprovision`、Team ID。
- `harmony` 是 `continue-on-error: true`：先装 `@ohos/hvigor`（华为 npm 源 `https://repo.harmonyos.com/npm/`），再尝试下载 command-line-tools。**HarmonyOS SDK 在华为开发者站，要登录同意协议，公开 runner 拉不到**；要真编就配 Secret `HOS_CLI_URL` 指向可直链的 zip，或用预装 DevEco 的自托管 runner。
- Android 相关的坑（都已在 workflow 里绕过）：`setup-android` 不可用 → 用 runner 预装 SDK；`macos-14` 会被 cancel → 用 `macos-latest`；debug keystore 不可写 → 建 `$HOME/.android`、`$HOME/.config/.android` 并 chmod，设 `ANDROID_USER_HOME`（**不要**设 `ANDROID_SDK_HOME`，会让 AGP 崩）；Gradle 9.9 与 AGP 8.5 不兼容 → 固定 `gradle-version: "8.7"`。

## 6. 功能矩阵（截至交接）

图例：✅ 与网页一致；🟡 只读/部分；❌ 无

| 页面 | CLI | Qt/KDE | Android | Swift | 鸿蒙 |
|---|---|---|---|---|---|
| 控制台 | ✅ info | ✅ | 🟡 | 🟡 | 🟡 |
| 我的分数 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| 分数管理 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 分组 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 排名 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| 每日汇报 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 金币 | ✅ | ✅ 兑换 | 🟡 | 🟡 | 🟡 |
| 抽奖 | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| 日志 | ✅ | ✅ 筛选 | ✅ 筛选 | ✅ 筛选 | ✅ 筛选 |
| 备份 | ✅ | ✅ 导入 | 🟡 | 🟡 | 🟡 |
| 账号 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| 职位 | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| 作业 | 🟡 | ✅ 只读种类 | ✅ | ✅ | ✅ |
| 硬件 | ✅ | ✅ | ✅ | ✅ macOS 串口 | ✅ |
| 历程 | ✅ 全班 | ✅ | ✅ | ✅ | ✅ |
| 考试 | ✅ | ✅ | ✅ | ✅ | 🟡 |
| 惩罚 | 🟡 info | ✅ | ❌ | ❌ | ❌ |
| 自动事件 | ✅ | ✅ | ✅ | ✅ | 🟡 |
| 选班 | ✅ | ✅ | ✅ | ✅ | ✅ |

## 7. 还没做完的（共 7 类，约 27 个功能点）

1. **惩罚管理**：Android / Swift / 鸿蒙（Qt 已是完整实现，照 `OpenStuMoreDialog` 的 `drawPunishment/completePunishment` 抄即可）。
   数据结构：`punishments.punishments`（按稀有度分组，`probability` 当权重）、`userPunishments.active/completed`。
2. **金币兑换/历史**：Android / Swift / 鸿蒙（Qt 有 `exchange(bool)`，读 `exchangeRate.score_to_gold`、`gold_to_score`）。
3. **账号改显示名 / 改密码**：五端都只有展示。网页逻辑在 `js/pages/account.js`，先确认后端存哪儿再动手。
4. **作业科目/种类增删**：五端只能初始化，不能编辑。网页在 `js/pages/homework.js`（`initAddType` / `initAddSubject`）。
5. **备份导入**：Android / Swift / 鸿蒙 / CLI（Qt 已实现，`importBackup()`：读 JSON → 兼容 `{data:{...}}` → 二次确认 → `saveClassData`）。
6. **排名组榜 + 分数分布图**：Qt / Android / Swift / 鸿蒙（CLI 的 `info rank` 已算组均分与分布）。
7. **抽奖记录 / 奖励池预览**：Android / Swift / 鸿蒙（CLI `info gacha`、Qt 抽奖页已有）。

## 8. 关键数据与接口

- 鉴权：`X-Password` + `X-Password-Hash`（sha256 hex）。
- `GET /api/class/{id}` → `{data:{...}}`；`POST /api/class/{id}` 覆盖整包。
- `/api/class/{id}/uuids`（读）、`/uuids/add`（绑定，`{uid, student_id}`）。
- `/api/class/{id}/homework/meta|init|status|required|update|day|raw`
- `/api/class/{id}/journal/{sid}`、`/journals?ids=`、`/journal`（POST 追加）。
- 数据键：`scores`（`[姓名,分]` 或 `{name,score}`）、`gold{sid:{amount}}`、`logs`（unshift 截 2000）、`groups{组名:[学号]}`、`exchangeRate`、`rewards`/`hidden_rewards`/`gachaHistory`、`positions`、`examScores{sid:[{id,date,name,score,full,subject}]}`、`dailyReport{日期:{allReported,lastReportTime}}`、`autoEvents`。

## 9. 已知坑

- **自动事件**必须照 `js/data.js` 的 `runAutoEvents()`：daily 每天；weekly 比 `dayOfWeek`（0=周日）；monthly 比 `date`；`lastRun[今天]` 为真就跳过；`targets` 解析 `all`/`group:组名`/学号；写完打点并整包保存。
- **iOS 不能串口**：Apple 不开放 USB 串口给第三方 App，端内只能手填 UID。**macOS 例外**：`/dev/cu.*` 可用，`Shared/MacSerial.swift` 已实现枚举、连接、按 `UID:` 前缀解析、发命令。
- **Android 不能刷固件**：没有维护中的原生 esptool 库，Chrome for Android 也没有 Web Serial。刷固件走网页端（esp-web-tools + `firmware-manifest.json`）。
- **GitHub API 对本机出口 IP 常 429**，`gh` 未登录，CI 状态多半靠用户贴日志。
- 本地能验证的只有 C++ CLI、Python CLI、Qt；Android/Swift/鸿蒙改动只能靠 CI 或用户设备验证。

## 10. 固件（arduino-hardware-code 分支）

- 芯片 1MB Flash → `fqbn esp8266:esp8266:generic:eesz=1M64`。
- 引脚：RC522 RST=D0/GPIO16、SS=D8/GPIO15、SCK=D5、MISO=D6、MOSI=D7、IRQ 不接；1602 SDA=D2/SCL=D1，地址 0x27/0x3F 自动探测。
- 配网页含「服务器地址」输入框（`%SERVER%`），存 `/server.txt`，运行时用 `serverHost`，不再写死。
- CI 一次编 `-Os/-O2/-O3` 三档，挂同一个 `hw-latest` Release；网页 `firmware-manifest.json` 指向 `openstu-v0.47-1M64-os.bin`。
- 上电 3 秒内板载 LED（GPIO2）每 60ms 爆闪提示可刷卡进入读卡模式。

## 11. 接手第一件事

1. `git worktree add /tmp/wt-clients native-clients`
2. `cd clients/linux-cli && make` 确认基线可编。
3. 打开 `clients/FEATURES.md` 与第 6 节矩阵，从「第 7 节第 1 条 惩罚管理」开始补，每补一端就更新 `FEATURES.md`。
4. 每端改完必须本地编译（能编的）或推上去看 CI，别只凭读代码判断。

---

有任何和本文件不一致的地方，以代码和 `js/pages/*.js` 为准；发现偏差请直接改本文件。
