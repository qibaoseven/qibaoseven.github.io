# OpenStu v0.46 (C++) 构建脚本
#   make            -> 本机 Linux/macOS 可执行 openstu（动态链接）
#   make linux-static -> Linux x86_64 静态单文件（拷到任何发行版都能跑）
#   make windows    -> Windows 单文件 OpenStu.exe（需要 mingw-w64）
#   make assets     -> 重新把前端打包进 src/assets.cpp（改了前端以后跑一次）

CXX      ?= g++
WIN_CXX  ?= x86_64-w64-mingw32-g++-posix
CXXFLAGS ?= -std=c++17 -O2 -I.
WINFLAGS  = -std=c++17 -Os -I. -static -static-libgcc -static-libstdc++
SRC       = src/main.cpp src/api.cpp src/assets.cpp

all: openstu

openstu: $(SRC) src/*.h
	$(CXX) $(CXXFLAGS) -o $@ $(SRC)

linux-static: $(SRC) src/*.h
	$(CXX) $(CXXFLAGS) -static -static-libgcc -static-libstdc++ -s -o openstu-linux $(SRC)
	@echo "==> $$(ls -lh openstu-linux | awk '{print $$5}') 静态 ELF，可直接拷到其它 Linux 机器"

windows: OpenStu.exe

OpenStu.exe: $(SRC) src/*.h
	$(WIN_CXX) $(WINFLAGS) -s -o $@ $(SRC) -lws2_32
	@echo "==> $@ 构建完成（双击即可运行，config.txt 放在同一目录）"

assets:
	python3 tools/gen_assets.py

clean:
	rm -f openstu openstu-linux OpenStu.exe

.PHONY: all linux-static windows assets clean
