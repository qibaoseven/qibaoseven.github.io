# openstu-cli —— Linux 命令行客户端
CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra
LDLIBS   ?= -lcurl
PREFIX   ?= /usr/local

all: openstu-cli

openstu-cli: main.cpp json.hpp sha256.h http.hpp
	$(CXX) $(CXXFLAGS) -o $@ main.cpp $(LDLIBS)

static: main.cpp json.hpp sha256.h http.hpp
	$(CXX) $(CXXFLAGS) -static -o openstu-cli-static main.cpp $(LDLIBS) \
	  || echo "静态链接需要 libcurl 的静态库(libcurl.a / 带 SSL)，跳过"

install: openstu-cli
	install -Dm755 openstu-cli $(DESTDIR)$(PREFIX)/bin/openstu-cli

clean:
	rm -f openstu-cli openstu-cli-static

.PHONY: all static install clean
