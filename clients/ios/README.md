# OpenStu iOS（SwiftUI）

- 网络层：`URLSession` + `Codable`，鉴权哈希用 `CryptoKit.SHA256`
- 界面：`NavigationStack` + `List` + `confirmationDialog` 选科目
- 配置：`UserDefaults`
- 工程：`xcodegen` 从 `project.yml` 生成，bundle id `io.qibaoseven.openstu`

```bash
brew install xcodegen
xcodegen generate && open OpenStu.xcodeproj
```

真机运行需要在 Xcode 里选一次 Team（免费 Apple ID 也可以，7 天签名）。下拉刷新、设置页都在导航栏。
