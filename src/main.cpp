#include "paths.h"

#include "bronze_host/host_storage.h"
#include "engine/engine.h"
#include "engine/launcher.h"
#include "util/crash_handler.h"
#include "util/interrupt.h"
#include "util/log.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#ifndef HELM_VERSION
#define HELM_VERSION "0.1.0"
#endif

namespace {

const char* kUsage =
    "helm %s -- Desktop Environment Shell\n"
    "\n"
    "Usage: helm [options]\n"
    "\n"
    "Options:\n"
    "      --drm              Run bare-metal on Linux DRM/KMS display with seat\n"
    "      --windowed         Run inside a windowed desktop session (default)\n"
    "      --no-gpu           Render on the CPU (software rasterizer)\n"
    "  -h, --help             Show this help text\n"
    "  -v, --version          Print the version and exit\n"
    "\n"
    "Config: %s\n";

} // namespace

int main(int argc, char* argv[]) {
    const std::string cfgDir = helm::configDir();
    bool noGpu = false;
    bool drmMode = false;
    bool windowedMode = false;

    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "-h") == 0 || std::strcmp(argv[i], "--help") == 0) {
            std::printf(kUsage, HELM_VERSION, cfgDir.c_str());
            return 0;
        }
        if (std::strcmp(argv[i], "-v") == 0 || std::strcmp(argv[i], "--version") == 0) {
            std::printf("helm %s\n", HELM_VERSION);
            return 0;
        }
        if (std::strcmp(argv[i], "--drm") == 0) {
            drmMode = true;
        } else if (std::strcmp(argv[i], "--windowed") == 0) {
            windowedMode = true;
        } else if (std::strcmp(argv[i], "--no-gpu") == 0) {
            noGpu = true;
        }
    }

    bro::util::installCrashHandler();
    bro::util::installSignalHandler();

    bro::engine::EngineConfig config;
    config.title = "Helm Desktop";
    config.displayMode = drmMode ? bro::engine::DisplayMode::Drm
                                 : bro::engine::DisplayMode::Windowed;
    config.settingsPath = cfgDir + "/helm_settings.json";
    config.showSplash = false;
    config.watchSources = true;
    config.isShellApp = true;
    if (noGpu) config.graphics.useGPU = false;

    if (!helm::locateUi(config)) {
        LOG_ERROR("helm: cannot find the ui/ directory near the executable or cwd");
        std::fprintf(stderr, "Error: cannot find ui/ directory near executable or cwd\n");
        return 1;
    }

    config.title = "Helm Desktop";
    config.showSplash = false;
    config.isShellApp = true;
    bro::engine::publishLaunchEnv(config);

    try {
        bro::engine::Engine engine(config);
        engine.run();
    } catch (const std::exception& e) {
        LOG_ERROR("helm: fatal: %s", e.what());
        std::fprintf(stderr, "Fatal error: %s\n", e.what());
        return 1;
    }

    bro::bronze_host::flushHostStorage();
    return 0;
}
