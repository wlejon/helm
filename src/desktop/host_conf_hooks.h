#pragma once

#include <cstdint>

namespace bro::engine {
class Engine;
}

namespace helm::desktop {

void installConfHooks(bro::engine::Engine& engine);
void dropConfState(uint64_t compartmentId);
void shutdownConfForReload();

}  // namespace helm::desktop
