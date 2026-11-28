#!/data/data/com.termux/files/usr/bin/bash
# NodeMCU v3（ESP8266 / 1MB Flash）固件刷写脚本 —— 给 Android 手机用（Termux）
#
# 用法： bash flash-termux.sh [固件bin或URL]
# 说明：Android 上没有 Web Serial，app 内无法直接刷；Termux 里能用真 esptool。
#      无 root 时 /dev/ttyUSB* 通常不存在，脚本会给出 nrflash 方案。
set -e

FW_URL="${1:-https://github.com/qibaoseven/qibaoseven.github.io/releases/download/hw-latest/openstu-v0.46-hw4-1M64.bin}"
FW="${FW_URL##*/}"

echo "==> 准备环境"
pkg install -y python clang make libusb termux-api >/dev/null 2>&1 || true
pip install --upgrade esptool >/dev/null 2>&1 || pip install esptool

echo "==> 下载固件: $FW"
if [ -f "$FW_URL" ]; then
  cp "$FW_URL" "$FW"
else
  curl -L -o "$FW" "$FW_URL"
fi
ls -lh "$FW"

echo "==> 找串口"
PORT=""
for p in /dev/ttyUSB* /dev/ttyACM*; do
  [ -e "$p" ] && PORT="$p" && break
done

if [ -n "$PORT" ]; then
  echo "使用 $PORT"
  python -m esptool --port "$PORT" --baud 115200 write_flash 0x0 "$FW"
  echo "==> 刷写完成，拔插一次板子即可"
else
  cat <<'TIP'
没有找到 /dev/ttyUSB*（Android 无 root 时这条路径不给子进程）。

两条可用的路：
1) 用 nrflash（走 termux-usb + libusb，不需要 root）：
     pkg install python termux-api libusb
     pip install nrflash
     nrflash <固件.bin>          # 具体参数见 nrflash --help
   需要装 F-Droid 版本的 Termux:API 应用，否则拿不到 USB 权限。

2) 把板子插到电脑，用网页端「硬件登记 → ⚡ 自动刷录」一键刷，不用敲命令。

手动等价命令（有串口节点时）：
     python -m esptool --port /dev/ttyUSB0 --baud 115200 write_flash 0x0 <固件.bin>
TIP
fi
