# OpenStu CLI（Python 版）

给 Windows 用的命令行：不编译、不装依赖，只用 Python 标准库，`py openstu.py <命令>` 直接跑。

```bat
py openstu.py config --class 51 --password 你的班级密码
py openstu.py status
py openstu.py scores --top 10
py openstu.py score 23 +2 --reason 讲题
py openstu.py gold 23 +50
py openstu.py gacha 23 --times 10
py openstu.py journal 23
py openstu.py logs --n 20
py openstu.py positions
py openstu.py pay
py openstu.py exam --student 23
py openstu.py report
py openstu.py backup openstu-backup.json
```

配置写在 `%APPDATA%\openstu-cli\config.json`（macOS/Linux 是 `~/.config/openstu-cli/config.json`）。

数据语义与 `backend/`（python/v0.46 服务端）和网页端一致：写操作都是「GET 整班 → 本地改 → POST 覆盖」，
分数、金币、日志一起回写；抽奖周五 12:00 后开放，单抽 160 / 十连 1600，按 `rewards` 的 `probability` 加权。
