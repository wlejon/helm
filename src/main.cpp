#include "desktop/desktop_host.h"
#include "paths.h"

#include "bronze_host/host_storage.h"
#include "engine/capabilities.h"
#include "engine/engine.h"
#include "engine/launcher.h"
#include "runtime/runtime_mains.h"
#include "util/crash_handler.h"
#include "util/exe_dir.h"
#include "util/interrupt.h"
#include "util/log.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

namespace {

const char* kUsage =
    "helm %s -- Desktop Environment Shell & App Runtime\n"
    "\n"
    "Usage: helm [--shell | --drm | --windowed] [--remote[=NAME]]\n"
    "       helm [flags] <app-directory | app-id> [app arguments...]\n"
    "       helm --install <app-directory> [--link] [--system] [--exec <helm>] [--no-exe]\n"
    "       helm --uninstall <app-id> | --list-apps | --desktop-entry <dir>\n"
    "       helm --permissions [<app-id | app-dir>] | --grant-app | --revoke-app | --dev-mode\n"
    "\n"
    "Shell options:\n"
    "      --shell            Run as primary OS desktop shell (reserves work area, borderless)\n"
    "      --drm              Run bare-metal on Linux DRM/KMS display with seat\n"
    "      --windowed         Run inside a windowed desktop session (default)\n"
    "      --remote[=NAME]    Host the screen for remote viewers on socket NAME (default: default)\n"
    "  -h, --help             Show this help text\n"
    "  -v, --version          Print the version and exit\n"
    "\n"
    "Config: %s\n";

bool isAppManagementCmd(std::string_view cmd) {
    return cmd == "--install" || cmd == "--uninstall" || cmd == "--list-apps" ||
           cmd == "--desktop-entry" || cmd == "--build-exe" || cmd == "--exe-info" ||
           cmd == "--permissions" || cmd == "--grant-app" || cmd == "--revoke-app" ||
           cmd == "--reset-app" || cmd == "--dev-mode";
}

bool isShellFlagWithValue(std::string_view a) {
    return a == "--grant" || a == "--notification" || a == "--scheduled";
}

bool isShellOnlyOrCommonFlag(std::string_view a) {
    return a == "--drm" || a == "--windowed" || a == "--shell" || a == "--remote" ||
           a.rfind("--remote=", 0) == 0 || a == "--no-splash" || a == "--splash" ||
           a == "--new-instance" || a == "--notification-activated" ||
           a == "-h" || a == "--help" || a == "-v" || a == "--version";
}

bool hasAppLaunchTarget(int argc, char* argv[]) {
    if (argc > 1 && isAppManagementCmd(argv[1])) return true;
    bool expectValue = false;
    for (int i = 1; i < argc; ++i) {
        std::string_view a(argv[i]);
        if (expectValue) { expectValue = false; continue; }
        if (a == "--") break;
        if (isShellFlagWithValue(a)) { expectValue = true; continue; }
        if (isShellOnlyOrCommonFlag(a)) continue;
        if (!a.empty() && a.front() != '-') return true;
    }
    return false;
}

std::string helmExecutablePath() {
#if defined(_WIN32)
    return (std::filesystem::path(bro::util::executableDir()) / "helm.exe").string();
#else
    return (std::filesystem::path(bro::util::executableDir()) / "helm").string();
#endif
}

bro::runtime::WindowedHooks desktopWindowedHooks() {
    bro::runtime::WindowedHooks hooks;
    hooks.programName = "helm";
    hooks.defaultExecPath = helmExecutablePath();
    hooks.installHostRootApis = helm::desktop::installDesktopRootApis;
    hooks.installWorkerHostBindings = helm::desktop::installDesktopWorkerApis;
    hooks.onDropCompartment = helm::desktop::dropDesktopCompartment;
    hooks.onShutdownForReload = helm::desktop::shutdownDesktopForReload;
    return hooks;
}

} // namespace

int main(int argc, char* argv[]) {
    // App management (`--install`, `--permissions`, ...) and launching a sandboxed
    // desktop app (`helm <app-dir | app-id>`) delegate to bro's windowed runner
    // with helm's desktop APIs mounted, and WITHOUT granting shell capabilities.
    if (hasAppLaunchTarget(argc, argv)) {
        const int rc = bro::runtime::runWindowed(argc, argv, nullptr, desktopWindowedHooks());
        helm::desktop::flushDesktopForExit();
        return rc;
    }

    const std::string cfgDir = helm::configDir();
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

    bro::util::installCrashHandler("helm", bro::util::CrashMode::System);
    bro::util::installSignalHandler();

    bro::engine::EngineConfig config;
    config.title = "Helm Desktop";
    config.displayMode = drmMode ? bro::engine::DisplayMode::Drm
                                 : bro::engine::DisplayMode::Windowed;
    config.settingsPath = cfgDir + "/helm_settings.json";
    config.showSplash = false;
    config.watchSources = true;

    if (!helm::locateUi(config)) {
        LOG_ERROR("helm: cannot find the ui/ directory near the executable or cwd");
        std::fprintf(stderr, "Error: cannot find ui/ directory near executable or cwd\n");
        return 1;
    }

    config.title = "Helm Desktop";
    config.showSplash = false;
    // helm is the desktop shell, and this executable its host: its UI gets
    // the shell's role and namespaces, which only a host grants, and every
    // capability a user could allow, since it is what manages the others
    // (bro docs/apps.md, Permissions). The apps helm starts get only their
    // own grants.
    config.hostGrants = bro::engine::allCapabilityNames();
    config.installHostRootApis = helm::desktop::installDesktopRootApis;
    config.installWorkerHostBindings = helm::desktop::installDesktopWorkerApis;
    config.onDropCompartment = helm::desktop::dropDesktopCompartment;
    config.onShutdownForReload = helm::desktop::shutdownDesktopForReload;
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
        config.desktopShell = true;
        LOG_INFO("Configured standalone shell borderless window: %dx%d at (%d, %d)",
                 config.graphics.width, config.graphics.height,
                 config.graphics.windowX, config.graphics.windowY);
    }
#endif

    bro::engine::publishLaunchEnv(config);

    try {
        bro::engine::Engine engine(config);
        engine.run();
    } catch (const std::exception& e) {
        LOG_ERROR("helm: fatal: %s", e.what());
        std::fprintf(stderr, "Fatal error: %s\n", e.what());
        helm::desktop::flushDesktopForExit();
        return 1;
    }

    helm::desktop::flushDesktopForExit();
    bro::bronze_host::flushHostStorage();
    return 0;
}
