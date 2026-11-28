# OpenStu Android（Kotlin + Compose）

- 网络层：`HttpURLConnection` + `org.json`，无 okhttp/retrofit
- 界面：Compose Material3，两页（连接班级 / 登记页）
- 配置：`SharedPreferences`（server / class_id / password）
- 密码校验：`MessageDigest("SHA-256")` 算 `X-Password-Hash`

```bash
./gradlew assembleDebug    # Android SDK 34 + JDK 17
```

进入登记页：顶部进度条 → 学生列表（显示每人今日 x/N）→ 点学生弹出科目选择 → 提交后自动刷新。
