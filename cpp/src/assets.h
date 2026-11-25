#pragma once
#include <string>
#include <cstddef>

namespace osc {

struct Asset {
  const char* path;
  const char* mime;
  const unsigned char* data;
  size_t size;
};

const Asset* assetTable(size_t& n);

}  // namespace osc
