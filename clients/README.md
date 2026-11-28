# OpenStu 原生客户端

面向「不想开浏览器」的场景，给同一套 OpenStu 后端（`https://os-stu.netlify.app/api`）做了五个原生前端。
它们共用同一套接口语义：`/classes`、`/class/{id}/students`、`/homework/required`、`/homework`、`/homework/update`。

| 目录 | 平台 | 技术栈 | 验证状态 |
|---|---|---|---|
| `android/` | Android 7.0+ | Kotlin 1.9 + Jetpack Compose + HttpURLConnection | 未编译（本机无 Android SDK）；设备管理页 + Termux 刷写脚本 |
| `swift/` | iOS 16+ / macOS 13+ / tvOS 17+ / watchOS 10+ / visionOS 1+ | Swift 5.9 + SwiftUI + URLSession + CryptoKit | 未编译（本机无 Xcode），`xcodegen` 生成五端工程；iOS 只缺「串口/刷录」 |
| `qt-windows/` | Windows 10+ | Qt 6 Widgets + QNetworkAccessManager | **已用 Qt 6.2 编译通过并在 offscreen 模式启动验证** |
| `linux-kde/` | Linux 桌面 | Qt 6 Widgets，可选 KDE Frameworks 6（KXmlGui 外壳） | **已用 Qt 6.2 编译通过**（本机无 KF6，走纯 Qt 降级分支；KDE 分支未编译验证） |
| `linux-cli/` | 任意 Linux | C++17 + libcurl，零第三方依赖 | **已编译通过并对线上 API 实测**（`openstu-cli classes` 拉到真实班级列表） |
| `harmony/` | HarmonyOS 5.0+ (API 12) | ArkTS + ArkUI 声明式，系统 NetworkKit / ArkData | 未编译（本机无 DevEco Studio / HarmonyOS SDK） |

## 功能范围（四个 GUI / 一个 CLI 一致）

1. **配置**：服务器地址、班级 ID、班级密码；校验方式与网页一致（`X-Password` + `X-Password-Hash`，SHA-256）
2. **今日应交**：`/homework/required` 的科目列表 + `已交 / 应交` 进度
3. **名册 × 状态矩阵**：`/students` 拿学号+姓名，`/homework` 拿位数组，按 `dateFrom` 推算今天的偏移
4. **登记**：点某个学生 → 选科目 → `POST /homework/update`（`changed=false` 时提示「原本已交，未重复计分」）
5. **刷新**：重拉 required + 名册 + 位数组，进度条同步

未包含：作业种类（`type_id`）的多选 UI、硬件登记页、初始化向导。这三块在网页端做，客户端只承担「日常刷卡替身」这一件事。

## 构建

### Linux CLI

```bash
cd clients/linux-cli
make                 # 产出 ./openstu-cli
./openstu-cli config --server https://os-stu.netlify.app --class class_xxx --password 你的密码
./openstu-cli status # 今日进度
./openstu-cli list   # 名册 × 今日科目
./openstu-cli submit 23 --subject 0
./openstu-cli watch --interval 3
```

Linux 静态版：`make static`（需要 libcurl 静态库）。

### Windows / KDE（Qt6）

```bash
cd clients/qt-windows     # 或 clients/linux-kde
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

Windows 打包运行时：`cmake --build build --target deploy`（调用 `windeployqt`，把 Qt DLL 拷到 exe 旁边）。

KDE 版在没有 `KF6XmlGui` 的机器上会自动降级成纯 Qt 窗口，编译不会失败；装了 KDE Frameworks 6 就套上 `KXmlGuiWindow` 和标准动作（刷新 / 退出）。

### Android

```bash
cd clients/android
./gradlew assembleDebug     # 需要 Android SDK 34 + JDK 17
```

用 Android Studio 打开 `clients/android` 目录也可以直接跑。只依赖 Compose + Material3，网络层是 `HttpURLConnection`，没有 okhttp/retrofit，便于离线构建。

### 鸿蒙

```bash
# 用 DevEco Studio 5.0 打开 clients/harmony（不要打开仓库根目录）
# 自动签名后 Run 'entry'；命令行构建：
cd clients/harmony && hvigorw assembleHap --mode module -p product=default
```

选型说明：鸿蒙上真正成熟的是官方 **ArkTS + ArkUI**（第一方语言，Stage 模型、权限、打包链路全官方）；
Flutter/React Native 的鸿蒙支持都是社区移植、生态滞后，KMP 的鸿蒙插件还在早期，所以没选。

### Swift 五端（iOS / macOS / tvOS / watchOS / visionOS）

```bash
cd clients/swift
xcodegen generate           # 生成含四个 target 的 OpenStu.xcodeproj
open OpenStu.xcodeproj
```

- `macOS`：分栏窗口（左班级信息+进度，右学生列表），⌘R 刷新
- `tvOS`：卡片网格 + 遥控器焦点，点卡片选科目
- `watchOS`：单列紧凑列表，详情页逐科勾选
- `visionOS`：玻璃材质卡片 + `hoverEffect(.lift)`，窗口内自适应网格
- `iOS`：完整功能（配置、进度、名册、登记、设备管理的手填 UID）；**只有串口与刷录在设备管理页明确写「无法使用」**——iOS 不向第三方开放 USB 串口
- 五个端共用 `Shared/DeviceView.swift`，端的差异只体现在提示文案的 `platformName`

## 安全与隐私说明

- 密码只保存在本机：Android 用 `SharedPreferences`、iOS 用 `UserDefaults`、桌面端用 `QSettings`、CLI 用 `~/.config/openstu-cli/config.json`（权限 0700）
- 网络请求一律走 HTTPS；密码在传输时用 `X-Password-Hash`（SHA-256），同时按接口要求带明文 `X-Password`
- 卡片 UID、学生姓名等敏感数据不落盘，只在内存里渲染
