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

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include "win_shell_broker.h"
#include "platform/desktop_platform.h"
#include "bronze_host/host_runtime.h"
#endif

namespace {

const char* kUsage =
    "helm %s -- Desktop Environment Shell\n"
    "\n"
    "Usage: helm [options]\n"
    "\n"
    "Options:\n"
    "      --shell            Run as primary OS desktop shell (reserves work area, borderless)\n"
    "      --drm              Run bare-metal on Linux DRM/KMS display with seat\n"
    "      --windowed         Run inside a windowed desktop session (default)\n"
    "      --remote[=NAME]    Host the screen for remote viewers on socket NAME (default: default)\n"
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
    bool shellMode = false;

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
        } else if (std::strcmp(argv[i], "--shell") == 0) {
            shellMode = true;
        } else if (std::strcmp(argv[i], "--no-gpu") == 0) {
            noGpu = true;
        } else if (std::strcmp(argv[i], "--remote") == 0 || std::strncmp(argv[i], "--remote=", 9) == 0) {
            // The UI hosts (ui/js/remote.js, bro.remote); it reads the socket
            // name from HELM_REMOTE.
            const char* name = argv[i][8] == '=' && argv[i][9] ? argv[i] + 9 : "default";
#if defined(_WIN32)
            _putenv_s("HELM_REMOTE", name);
#else
            ::setenv("HELM_REMOTE", name, 1);
#endif
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
#if defined(_WIN32)
    // Winlogon starts custom shells without a console attached.
    // Redirect stderr to helm.log so all diagnostics, errors, and crash reports are persisted.
    std::error_code ec;
    std::filesystem::create_directories(cfgDir, ec);
    std::string logFilePath = (std::filesystem::path(cfgDir) / "helm.log").string();
    FILE* logFp = nullptr;
    if (freopen_s(&logFp, logFilePath.c_str(), "a", stderr) == 0 && logFp) {
        setvbuf(logFp, nullptr, _IONBF, 0);
    }

    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    HWND trayHwnd = FindWindowW(L"Shell_TrayWnd", nullptr);
    const bool isStandaloneShell = !windowedMode && (shellMode || (trayHwnd == nullptr));
    LOG_INFO("Helm %s starting (PID %lu, standalone=%s, trayFound=%s)",
             HELM_VERSION,
             GetCurrentProcessId(),
             isStandaloneShell ? "true" : "false",
             trayHwnd != nullptr ? "true" : "false");

    if (isStandaloneShell) {
        int screenW = GetSystemMetrics(SM_CXSCREEN);
        int screenH = GetSystemMetrics(SM_CYSCREEN);
        if (screenW > 0 && screenH > 0) {
            config.graphics.width = screenW;
            config.graphics.height = screenH;
        }
        config.graphics.windowX = 0;
        config.graphics.windowY = 0;
        config.graphics.borderless = true;
        config.graphics.resizable = false;
        config.graphics.alwaysOnTop = false;
        helm::WinShellBroker::init(40);
        LOG_INFO("Configured standalone shell borderless window: %dx%d at (%d, %d)",
                 config.graphics.width, config.graphics.height,
                 config.graphics.windowX, config.graphics.windowY);
    }

    config.installHostBindings = [](bro::engine::Engine& engine) {
        helm::WinShellBroker::installHostBindings(engine);
    };
#endif

    const char* existingTrusted = std::getenv("BRO_TRUSTED_APP_DIR");
    std::string trustedDirs = config.appDir;
    if (existingTrusted && *existingTrusted) {
#if defined(_WIN32)
        trustedDirs += ";" + std::string(existingTrusted);
#else
        trustedDirs += ":" + std::string(existingTrusted);
#endif
    }
#if defined(_WIN32)
    _putenv_s("BRO_TRUSTED_APP_DIR", trustedDirs.c_str());
#else
    ::setenv("BRO_TRUSTED_APP_DIR", trustedDirs.c_str(), 1);
#endif
    bro::engine::publishLaunchEnv(config);

    try {
        bro::engine::Engine engine(config);
#if defined(_WIN32)
        if (isStandaloneShell) {
            if (engine.window()) {
                HWND hwnd = bro::platform::desktop::hwndOf(engine.window());
                if (hwnd) {
                    helm::WinShellBroker::attachWindow(hwnd);
                }
            }
            engine.addFramePump([&engine]() {
                static bool attached = false;
                if (!attached && engine.window()) {
                    HWND hwnd = bro::platform::desktop::hwndOf(engine.window());
                    if (hwnd) {
                        helm::WinShellBroker::attachWindow(hwnd);
                        attached = true;
                    }
                }
                helm::WinShellBroker::tick();
            });
        }
#endif
        engine.run();
    } catch (const std::exception& e) {
        LOG_ERROR("helm: fatal: %s", e.what());
        std::fprintf(stderr, "Fatal error: %s\n", e.what());
#if defined(_WIN32)
        helm::WinShellBroker::restore();
#endif
        return 1;
    }

#if defined(_WIN32)
    helm::WinShellBroker::restore();
#endif

    bro::bronze_host::flushHostStorage();
    return 0;
}
