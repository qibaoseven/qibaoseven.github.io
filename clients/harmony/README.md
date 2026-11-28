# OpenStu 鸿蒙端（ArkTS / ArkUI）

## 为什么选 ArkTS 而不是别的框架

鸿蒙上可选的原生方案有四类，成熟度差别很大：

| 方案 | 状态 | 结论 |
|---|---|---|
| **ArkTS + ArkUI（官方）** | 第一方语言与 UI 框架，随 HarmonyOS NEXT（API 12+）发布，DevEco Studio 直接支持，Ability/Stage 模型、权限、打包链路全部官方 | **选它**：唯一"开箱即用、不会被框架坑"的路线 |
| Flutter for OpenHarmony | 社区做的引擎移植（flutter_ohos 分支），插件生态不齐，通常滞后一个版本 | 功能能跑，但相机/网络/存储这类系统能力都要自己补适配 |
| React Native for OpenHarmony | 同样是社区移植（RNOH），三方库覆盖率更低 | 不推荐做首发版本 |
| Kotlin Multiplatform + 鸿蒙插件 | 第三方 KMP 鸿蒙支持仍在早期，工具链不稳定 | 现阶段不适合生产 |

所以这个目录是**纯 ArkTS 工程（Stage 模型，API 12）**，不引任何三方依赖——网络用系统 `@kit.NetworkKit`，存储用 `@kit.ArkData` 的 preferences，SHA-256 用 ArkTS 自己实现的纯函数（和网页端、CLI 算出来的 `X-Password-Hash` 完全一致，注册/登录都对得上）。

## 目录

```
clients/harmony/
├── AppScope/                     应用级配置与应用图标
├── build-profile.json5           工程配置（compatibleSdkVersion 5.0.0(12)）
├── oh-package.json5
├── hvigorfile.ts
└── entry/                        主模块
    ├── build-profile.json5
    ├── oh-package.json5
    ├── hvigorfile.ts
    └── src/main/
        ├── module.json5          入口 Ability + INTERNET 权限
        ├── ets/
        │   ├── entryability/EntryAbility.ets
        │   ├── model/Api.ets     接口层（含 SHA-256、错误信息还原 409 的 required 列表）
        │   ├── model/Store.ets   preferences 读写配置
        │   └── pages/Index.ets   配置页 + 登记页
        └── resources/base/       图标、字符串、颜色、页面清单
```

## 功能

与其它客户端一致，只做"日常刷卡替身"：

1. 配置服务器 / 班级 ID / 密码（可点"拉取班级列表"按班级名核对 ID）
2. 今日应交科目 + `已交/应交` 线性进度
3. 学生列表（学号 · 姓名 · 今日 x/N）
4. 点学生 → 弹科目面板 → `POST /homework/update`；`changed=false` 时提示"原本已交，未重复计分"
5. 登记成功后自动重拉 required / roster / homework

## 构建

1. 装 **DevEco Studio 5.0**（内置 HarmonyOS SDK API 12 与 hvigor）
2. `File → Open` 打开 `clients/harmony`（**不要**打开外层仓库根目录）
3. 首次需要签名：`Project Structure → Signing Configs → Automatically generate signature`（用自己的华为账号，手机会自动装调试证书）
4. `Run 'entry'` 到真机（鸿蒙 5.0+）或模拟器

命令行构建（hvigor 已在 DevEco 里自带，需先 `npm i -g @ohos/hvigor` 或直接用 IDE 终端）：

```bash
cd clients/harmony
hvigorw clean --no-daemon
hvigorw assembleHap --mode module -p product=default --no-daemon
# 产物：entry/build/default/outputs/default/entry-default-signed.hap
```

## 已知未验证项

这个工程是**按官方 API 12 规范手写的**，但当前环境里没有 DevEco Studio / HarmonyOS SDK，所以：

- 没有跑过 `hvigorw assembleHap`，首次打开可能有资源引用名、`module.json5` 字段或 ArkTS 严格模式的编译报错
- `hvigorfile.ts`、`build-profile.json5` 的精简字段是按模板写的，DevEco 首次导入时可能会提示"补齐工程配置"，按提示自动补全即可
- `app_icon.png` 是我生成的 192×192 占位图（蓝底白环），正式发布前换成自己的图标

有报错直接把 IDE 的 Build Output 贴给我，我按真实报错改。
