// 存储层：<data>/<bucket>/<key>.json，行为对齐 Python 的 LocalStore
#pragma once
#include <string>
#include <optional>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <cstdio>

namespace osc {

namespace fs = std::filesystem;

class LocalStore {
public:
  LocalStore(std::string root, std::string bucket)
      : dir_(fs::path(root) / bucket) {}

  std::optional<std::string> get(const std::string& key) const {
    fs::path p = pathFor(key);
    std::ifstream in(p, std::ios::binary);
    if (!in) return std::nullopt;
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
  }

  bool set(const std::string& key, const std::string& value) const {
    fs::path p = pathFor(key);
    std::error_code ec;
    fs::create_directories(dir_, ec);
    std::ofstream out(p, std::ios::binary | std::ios::trunc);
    if (!out) return false;
    out.write(value.data(), (std::streamsize)value.size());
    return true;
  }

  bool del(const std::string& key) const {
    std::error_code ec;
    fs::remove(pathFor(key), ec);
    return true;
  }

private:
  fs::path pathFor(const std::string& key) const {
    // 与 Python 一致：拒绝路径穿越
    if (key.empty() || key == "." || key.find('/') != std::string::npos
        || key.find('\\') != std::string::npos || key.find("..") != std::string::npos) {
      throw std::runtime_error("非法的存储 key: " + key);
    }
    return dir_ / (key + ".json");
  }

  fs::path dir_;
};

}  // namespace osc
