# OpenStu Android（Kotlin + Compose）

- 网络层：`HttpURLConnection` + `org.json`，无 okhttp/retrofit
- 界面：Compose Material3，两页（连接班级 / 登记页）
- 配置：`SharedPreferences`（server / class_id / password）
- 密码校验：`MessageDigest("SHA-256")` 算 `X-Password-Hash`

```bash
# 仓库里没有提交 gradle wrapper（生成它需要本机有 gradle），两种方式二选一：
gradle wrapper --gradle-version 8.7 && ./gradlew assembleDebug
# 或者直接用 Android Studio 打开 clients/android 目录，IDE 会自动补 wrapper
```

环境要求：Android SDK 34 + JDK 17。

进入登记页：顶部进度条 → 学生列表（显示每人今日 x/N）→ 点学生弹出科目选择 → 提交后自动刷新。
