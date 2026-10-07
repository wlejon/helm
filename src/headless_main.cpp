#include "paths.h"

#include "bronze_host/host_storage.h"
#include "engine/headless_driver.h"
#include "util/crash_handler.h"
#include <cstdlib>

int main(int argc, char* argv[]) {
    bro::util::installCrashHandler();
    bro::engine::HeadlessHooks hooks;
    hooks.programName = "helm-headless";
    hooks.tagline = "the helm desktop environment UI, driven by a test script";
    hooks.beforeExit = [] { bro::bronze_host::flushHostStorage(); };
    return bro::engine::runHeadless(argc, argv, hooks);
}
