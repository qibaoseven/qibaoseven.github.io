# openstu-cli

C++17 + libcurl 的命令行客户端，零第三方依赖（JSON 与 SHA-256 都是自带单文件实现）。

```bash
make                # ./openstu-cli
make static         # 需要 libcurl 静态库；失败会提示跳过
make install        # 装到 /usr/local/bin（可 PREFIX=... DESTDIR=...）
```

命令：`config` / `classes` / `status` / `list` / `submit` / `watch` / `whoami`，`--json` 输出机器可读结果。

配置存放在 `~/.config/openstu-cli/config.json`（目录 0700）。
