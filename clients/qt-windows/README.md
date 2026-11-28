# OpenStu Desktop（Windows / Qt6）

单窗口桌面客户端：上方填服务器 / 班级 / 密码（记住在 QSettings），中间是今日进度条，
下方是「学号 × 今日科目」表格，点某格弹出确认后直接 `POST /homework/update`。

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
cmake --build build --target deploy   # Windows：windeployqt 拷 Qt DLL
```

界面与 KDE 版共用 `../common-cpp/OpenStuWindow.*`，改一处两个平台同步生效。
