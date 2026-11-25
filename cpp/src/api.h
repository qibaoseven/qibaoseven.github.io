#pragma once
#include "src/core.h"

namespace osc {
Response handleApi(const Request& req, const AppState& st, bool& matched);
}
