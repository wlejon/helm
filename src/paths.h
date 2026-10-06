#pragma once

#include "engine/engine_config.h"
#include <string>

namespace helm {

std::string getEnv(const char* name);
std::string configDir();
bool locateUi(bro::engine::EngineConfig& config);

} // namespace helm
