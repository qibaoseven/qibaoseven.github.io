# OpenStu for KDE（Linux / Qt6 + 可选 KF6）

同一套界面放进 `KXmlGuiWindow`，菜单用 KDE 标准动作（刷新 F5 / 退出 Ctrl+Q）。

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release     # 默认尝试找 KF6XmlGui
cmake --build build -j
# 没有 KDE Frameworks 就不链接它，自动降级为纯 Qt 窗口：
cmake -S . -B build -DOPENSTU_WITH_KDE=OFF
```

装 KDE 依赖（举例，Arch）：`pacman -S extra-cmake-modules kxmlgui`；
Debian/Ubuntu 上对应 `kf6-kxmlgui-dev` 或 `kxmlgui-dev`（KF5 需自行改 CMake 里的 `KF6::` 前缀）。
