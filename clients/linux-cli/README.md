# openstu-cli

C++17 + libcurl 的命令行客户端，零第三方依赖（JSON 与 SHA-256 都是自带单文件实现）。

```bash
make                # ./openstu-cli
make static         # 需要 libcurl 静态库；失败会提示跳过
make install        # 装到 /usr/local/bin（可 PREFIX=... DESTDIR=...）
```

## 命令

作业相关：

- `config` / `classes` / `status` / `list` / `submit` / `watch` / `whoami`

班级数据与积分（对应网页「控制台 / 分数管理 / 金币系统 / 排名 / 抽奖」）：

- `classinfo` 班级概览（人数、均分、金币、分组数、日志数、作业系统状态、汇率）
- `scores [--top N] [--gold]` 分数或金币排行
- `score <学号> +2 --reason 说明` 加减分，同时写一条操作日志
- `gold <学号> +50` 加减金币（下限 0）
- `gacha <学号> [--times 10]` 抽奖：周五 12:00 后开放，单抽 160 / 十连 1600，按 `rewards` 的 `probability` 权重抽

学生历程与日志（对应「学生历程 / 操作日志 / 分组管理」）：

- `journal <学号>` 读历程　`journal-add <学号> "内容" [--operator 姓名]` 追加　`journal-export` 导出全班
- `logs [--n 30]` 最近操作日志　`groups` 分组与组均分

作业初始化与硬件（对应「作业初始化 / 硬件登记」）：

- `init --students 51 --subjects 语文,数学 [--start 2026-09-01]`
- `types` 已配置的作业种类
- `uid 12:34:56:78:9A:BC:DE 23 [--subject 0] [--type 1]` 绑卡并顺带登记
- `uids` 全班卡号字典

所有写操作都是 **GET 班级数据 → 本地改 → POST 覆盖保存**，和网页版 `saveAllDataToCloud()` 同一套语义（分数栏、金币、日志一起回写）。

配置存放在 `~/.config/openstu-cli/config.json`（目录 0700）。
