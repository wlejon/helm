#pragma once

#include <cstdint>

namespace bro::engine {
class Engine;
}

namespace helm::desktop {

void installDesktopRootApis(bro::engine::Engine& engine);
void installDesktopWorkerApis();
void dropDesktopCompartment(uint64_t compartmentId);
void shutdownDesktopForReload();
void flushDesktopForExit();

}  // namespace helm::desktop
