# OpenStu v0.46 · Rust 单文件版

和 `cpp/v0.46` 同需求、同行为：后端用 Rust 重写，编译成**双击就能用**的可执行文件。
程序自己起 HTTP 服务、自己把前端（`index.html` / `js/` / `assets/`）从二进制里吐出来，
启动后自动打开浏览器。不需要 Python、不需要 Node、不需要额外文件夹。

数据格式、加密格式、接口语义与 `python/v0.46` 完全一致，三个版本的数据目录可以互换。

## 目录

```
rust/
├── Cargo.toml            依赖：aes-gcm / sha2 / hmac / base64 / serde_json / chrono（全纯 Rust）
├── README.md             本文件
├── build.sh              构建脚本
├── tools/gen_assets.py   前端 → src/assets.rs（include_bytes!）
└── src/
    ├── main.rs           入口：读 config.txt、起服务、开浏览器、发静态资源
    ├── api.rs            路由分发（顺序照搬 Python 版）
    ├── http.rs           极简 HTTP/1.1 服务端（std + 线程）
    ├── store.rs          本地存储（<data>/<bucket>/<key>.json，裸字符串写入）
    ├── crypto.rs         HMAC 派生密钥 + AES-256-GCM + Base64
    ├── core.rs           日期、HWSF 位打包、required、UID 归一化
    ├── app.rs            班级桶、token、学生抽取、历程读写、密码校验
    ├── routes_basic.rs   班级 / UID / 模板
    ├── routes_homework.rs 作业全部接口
    ├── routes_journal.rs 学生历程
    ├── template.rs       班级数据收集指令模板
    └── assets.rs         自动生成的前端资源表
```

## 构建

本机（Linux / macOS / Windows 装有 MSVC 或 MinGW 均可）：

```bash
cd rust
cargo build --release
./target/release/openstu
```

Windows 单文件 exe（Linux 上交叉编译，需要 mingw-w64）：

```bash
sudo apt-get install mingw-w64
cd rust && ./build.sh windows
# 产物：rust/OpenStu.exe，约 0.96 MB（opt-level="s" + LTO + strip）
```

或者直接在 Windows 上用 rustup 的默认工具链：

```
cargo build --release --target x86_64-pc-windows-msvc
```

改了前端（`index.html`、`js/`、`assets/`、`*.css`）之后重新打包：

```bash
cd rust && ./build.sh assets && ./build.sh windows
```

## config.txt

读**和 exe 同一目录**的 `config.txt`，不存在会自动生成一份默认的：

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

- `host` 支持 IPv4 字面量（`127.0.0.1` / `0.0.0.0` / 局域网 IP），不解析域名。
- `port` 非法或 0 会回落到 8080。
- `data_dir` 可写绝对路径；相对路径跟着 exe 走，整个文件夹能直接拷到 U 盘。
- 想让同一局域网里的手机访问，把 `host` 改成 `0.0.0.0`，浏览器地址仍是 `127.0.0.1`。

## 数据与兼容性

```
data/
├── studentos-main/            classes.json、tokens.json
└── class-class_xxx/           data.json、password_hash.json、homework_meta.json、
                               homework_data.json（HWSF 位打包 + AES-256-GCM）、
                               homework_required.json、uuids.json、journal_<学号>.json
```

加密：`base64(iv12 ‖ tag16 ‖ ciphertext)`，`key = HMAC-SHA256(key=password, msg="")`，
明文前缀 `JSON:` / `HWSF`，与 Python 版逐字节一致。

已做的等价性验证（Python 起 8099、Rust 起 8097 指向同一份数据）：

- Python 写 → Rust 读：12 个 GET 接口逐字段一致。
- Rust 写 → Python 读：写完之后把数据目录换给 Python，同样 0 差异。
- 交叉编译出的 Windows exe 在 wine 里跑同一套用例，同样 0 差异。
- 写入与错误码：`classes/create`、`homework/init|day|update`（200/`changed`、404 `UID_NOT_BOUND`、
  409 `SUBJECT_NOT_REQUIRED`）、`uuids` 三个接口（`added` 语义、同卡不能绑两学号）、
  `journal` 追加（含字符数统计）逐条对齐，全部 0 差异。

## 与另外两个版本的差异

| 项 | Python 版 | C++ 版 | Rust 版 |
| --- | --- | --- | --- |
| 依赖 | Flask | 无（自研密码学） | crates.io 纯 Rust 库 |
| 产物 | 源码目录 | 单文件 exe 1.7 MB | 单文件 exe 0.96 MB |
| 前端 | 目录现读 | 编进二进制 | 编进二进制（`include_bytes!`） |
| 浏览器 | 手动 | 自动 | 自动 |
| `/api/classes/import` | 支持（JsonBin+TLS） | 不支持 | 不支持（同样返回 400 提示） |

`OpenStu.exe` 的依赖只有系统自带 DLL：`kernel32` / `bcrypt`（Vista 起就有）/ `ws2_32` / `msvcrt`。
**不带 `bcryptprimitives.dll` 依赖**——为了让 Win7/8 和 wine 也能跑，随机数与本地时间都改成直接调系统 API：

- 随机字节：Windows 走 `BCryptGenRandom`，Unix 走 `/dev/urandom`；不再用 std 的进程随机种子，
  也不让 `HashMap` 的默认哈希器去取种子（内部改用 `BTreeMap`）。
- 本地时间：Windows 走 `GetLocalTime`，Unix 走 `localtime_r`；不走 chrono 的时区数据库，
  避免系统时区信息缺失时 panic。

已经在 wine（Windows 兼容层）里跑过完整联调：起服务、发静态页面、`/api/*` 读写全部正常，
和 Python 版逐请求比对 0 差异（唯一"不同"的是 `/homework/raw` 的密文本体，IV 随机所致）。

## 开机自启（可选）

`Win+R` → `shell:startup`，把 `OpenStu.exe` 的快捷方式丢进去。程序用自身路径定位
`config.txt` 和 `data/`，快捷方式的“起始位置”不影响运行。
