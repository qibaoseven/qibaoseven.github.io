# OpenStu v0.46 · C++ 单文件版

把 `python/v0.46` 的后端从 Flask 换成 C++，编译成一个**双击就能用**的可执行文件：
程序自己起 HTTP 服务、自己把前端页面（`index.html` / `js/` / `assets/`）从二进制里吐出来，
并在启动后自动打开浏览器。不需要 Python、不需要 Node、不需要额外文件夹。

## 目录

```
cpp/
├── README.md              本文件
├── Makefile               构建脚本
├── tools/gen_assets.py    把前端文件打包成 src/assets.cpp
├── third_party/json.hpp   nlohmann/json 3.11.3（单头文件）
└── src/
    ├── main.cpp           入口：读 config.txt、起服务、开浏览器、发静态资源
    ├── api.cpp            路由分发（顺序照搬 Python 版）
    ├── api.h              路由声明
    ├── http.h             极简 HTTP/1.1 服务端 + 跨平台浏览器拉起
    ├── store.h            本地 JSON 存储（<data>/<bucket>/<key>.json）
    ├── crypto.h           自研 SHA-256 / HMAC / AES-256-GCM / Base64
    ├── core.h             日期、加解密、作业位打包、required、UID 归一化
    ├── routes_basic.h     班级 / UID / 模板
    ├── routes_homework.h  作业全部接口
    ├── routes_journal.h   学生历程
    ├── assets.cpp         自动生成的前端资源（30 个文件）
    └── assets.h
```

## 构建

Linux / macOS：

```bash
cd cpp && make
./openstu
```

Windows 单文件 exe（在 Linux 上用 mingw-w64 交叉编译，或 WSL 里同样命令）：

```bash
sudo apt-get install mingw-w64
cd cpp && make windows
# 产物：cpp/OpenStu.exe，约 1.7 MB，静态链接，无运行库依赖
```

在 Windows 本机也可以用 MSYS2 / MinGW-w64 的 `g++` 直接：

```
g++ -std=c++17 -O2 -I. -o OpenStu.exe src\main.cpp src\api.cpp src\assets.cpp -lws2_32 -static
```

改了前端（`index.html`、`js/`、`assets/`、`*.css`）之后，重新打包一次：

```bash
cd cpp && make assets && make windows
```

## config.txt

程序启动时读**和 exe 同一目录**的 `config.txt`；文件不存在会自动生成一份默认的。

```ini
# host: 监听地址，127.0.0.1 只允许本机；0.0.0.0 允许局域网访问
host=127.0.0.1
# port: 端口，被占用就换一个
port=8080
# open_browser: 启动后自动打开浏览器（1/0）
open_browser=1
# data_dir: 数据目录，相对路径以 exe 所在目录为基准
data_dir=data
# browser_url: 自动打开的地址，留空 = http://<host>:<port>/
browser_url=
```

说明：

- `host` 支持 IPv4 字面量（`127.0.0.1` / `0.0.0.0` / 局域网 IP），不解析域名。
- `port` 非法或超出 1–65535 会回落到 8080。
- `data_dir` 写成绝对路径（`D:\OpenStu\data`）也认；写相对路径就跟着 exe 走，方便整个文件夹拷到 U 盘。
- 想让同一局域网里的手机也能打开，把 `host` 改成 `0.0.0.0`，然后用 `http://<电脑IP>:端口/` 访问；此时自动打开的浏览器地址仍是 `127.0.0.1`。

## 数据格式与兼容性

存储布局与 Python 版**完全一致**，两边的数据目录可以互相拷着用：

```
data/
├── studentos-main/            classes.json、tokens.json
└── class-class_xxx/           data.json、password_hash.json、homework_meta.json、
                               homework_data.json（HWSF 位打包 + AES-256-GCM）、
                               homework_required.json、uuids.json、journal_<学号>.json
```

加密格式：`base64(iv12 ‖ tag16 ‖ ciphertext)`，`key = HMAC-SHA256(password, "")`，
明文前缀 `JSON:` / `HWSF` / `JNSF`，与 Python 的 `cryptography` 实现逐字节一致。
已在本地用同一份数据做过往返验证：Python 写入 → C++ 读取、C++ 写入 → Python 读取，
`/api/classes`、整班数据、作业（含 required/student/raw）、UID、历程全部逐字段一致。

已测过的等价性范围：所有 GET 接口、`classes/create`、`homework/init|day|update`、
`uuids` 三个接口、`journal` 追加，包括各种错误码（401 `CLASS_NOT_RIGHT`、
`BAD_PASSWORD`、404 `UID_NOT_BOUND`、409 `SUBJECT_NOT_REQUIRED`、400 参数非法）。

## 与 Python 版的差异

| 项 | Python 版 | C++ 版 |
| --- | --- | --- |
| 部署 | 需要 python3 + Flask，跑 `backend/api.py` | 单文件 exe，双击即用 |
| 前端 | 由 Flask 直接发项目根目录文件 | 前端已编译进 exe，改前端要重新打包 |
| 浏览器 | 手动打开 | 默认自动打开（`open_browser=0` 可关） |
| `/api/classes/import` | 走外网 JsonBin + TLS 导入 | **不支持**，返回 400 提示改用导出的 JSON 手动建班 |
| 并发 | Flask threaded | 每连接一个线程，够一个班用 |

`/api/classes/import` 是唯一的功能缺口：它要从公网拉一份 JsonBin 数据并做 TLS 校验，
C++ 版没有引入 TLS 客户端。真需要的话，可以让 Python 版导出一份班级 JSON，再走
`classes/create`（exe 里一样能建班）。

## 开机自启（可选）

Windows：`Win+R` 输入 `shell:startup`，把 `OpenStu.exe` 的**快捷方式**丢进去即可。
注意快捷方式的“起始位置”不影响运行，因为程序用自身路径定位 `config.txt` 和 `data/`。
