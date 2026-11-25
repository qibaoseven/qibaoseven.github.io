#!/usr/bin/env bash
# OpenStu v0.46 (Rust) 构建脚本
#   ./build.sh            -> 本机可执行 target/release/openstu
#   ./build.sh windows    -> Windows 单文件 OpenStu.exe（需要 mingw-w64 + rustup target）
#   ./build.sh assets     -> 重新把前端打包进 src/assets.rs
set -e
cd "$(dirname "$0")"

case "${1:-native}" in
  assets)
    python3 tools/gen_assets.py
    ;;
  windows)
    rustup target add x86_64-pc-windows-gnu 2>/dev/null || true
    cargo build --release --target x86_64-pc-windows-gnu
    cp target/x86_64-pc-windows-gnu/release/openstu.exe ./OpenStu.exe
    echo "==> rust/OpenStu.exe 构建完成（双击即可运行，config.txt 放同目录）"
    ;;
  *)
    cargo build --release
    echo "==> target/release/openstu"
    ;;
esac
