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
#include <commctrl.h>
#pragma comment(lib, "comctl32.lib")

#include "platform/desktop_platform.h"
#include "platform/sdl_window.h"
#include "bronze_host/host_runtime.h"

namespace {

class WindowsShellManager {
public:
    static void init(int panelHeight = 40) {
        HMONITOR hMon = MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY);
        MONITORINFO mi{};
        mi.cbSize = sizeof(mi);
        if (GetMonitorInfoW(hMon, &mi)) {
            s_originalWorkArea = mi.rcWork;
            RECT newWork = mi.rcMonitor;
            newWork.top += panelHeight;
            SystemParametersInfoW(SPI_SETWORKAREA, 0, &newWork, SPIF_SENDCHANGE);
            s_hasReserved = true;
        }
    }

    static void restore() {
        if (s_hwnd && s_subclassed) {
            RemoveWindowSubclass(s_hwnd, shellSubclassProc, 1);
            s_subclassed = false;
        }
        if (s_hasReserved) {
            SystemParametersInfoW(SPI_SETWORKAREA, 0, &s_originalWorkArea, SPIF_SENDCHANGE);
            s_hasReserved = false;
        }
    }

    static void attachWindow(HWND hwnd) {
        if (!hwnd || s_subclassed) return;
        s_hwnd = hwnd;
        if (SetWindowSubclass(hwnd, shellSubclassProc, 1, 0)) {
            s_subclassed = true;
            // Initially pin Helm desktop to the bottom of the Z-order beneath application windows
            SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                         SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            LOG_INFO("WindowsShellManager: subclassed HWND %p and pinned to HWND_BOTTOM", (void*)hwnd);
        }
    }

    static void setModalActive(bool active) {
        s_modalActive = active;
        if (!s_hwnd) return;
        if (active) {
            // Bring Helm over other applications so modal/launcher/popup is visible and receives keystrokes
            SetWindowPos(s_hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
            SetForegroundWindow(s_hwnd);
        } else {
            // Return Helm behind running applications
            SetWindowPos(s_hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                         SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            AllowSetForegroundWindow(ASFW_ANY);
        }
    }

    static bool isModalActive() {
        return s_modalActive;
    }

private:
    static LRESULT CALLBACK shellSubclassProc(
        HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam,
        UINT_PTR uIdSubclass, DWORD_PTR dwRefData) {

        switch (uMsg) {
            case WM_MOUSEACTIVATE: {
                // If a modal or launcher is active, allow normal activation.
                // Otherwise, return MA_NOACTIVATE so clicking the desktop wallpaper or
                // top panel does NOT raise Helm above running applications!
                if (!s_modalActive) {
                    return MA_NOACTIVATE;
                }
                return MA_ACTIVATE;
            }

            case WM_WINDOWPOSCHANGING: {
                if (!s_modalActive) {
                    WINDOWPOS* wp = reinterpret_cast<WINDOWPOS*>(lParam);
                    if (wp && !(wp->flags & SWP_NOZORDER)) {
                        wp->hwndInsertAfter = HWND_BOTTOM;
                    }
                }
                break;
            }

            case WM_ACTIVATE: {
                if (!s_modalActive && LOWORD(wParam) != WA_INACTIVE) {
                    SetWindowPos(hWnd, HWND_BOTTOM, 0, 0, 0, 0,
                                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                }
                break;
            }

            case WM_DESTROY: {
                RemoveWindowSubclass(hWnd, shellSubclassProc, uIdSubclass);
                s_subclassed = false;
                s_hwnd = nullptr;
                break;
            }
        }

        return DefSubclassProc(hWnd, uMsg, wParam, lParam);
    }

    static inline RECT s_originalWorkArea{};
    static inline bool s_hasReserved = false;
    static inline HWND s_hwnd = nullptr;
    static inline bool s_subclassed = false;
    static inline bool s_modalActive = false;
};

} // namespace
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
    config.watchSources = false;
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
        WindowsShellManager::init(40);
        LOG_INFO("Configured standalone shell borderless window: %dx%d at (%d, %d)",
                 config.graphics.width, config.graphics.height,
                 config.graphics.windowX, config.graphics.windowY);

        config.installHostBindings = [](bro::engine::Engine& /*engine*/) {
            namespace ev = bronze::embed;
            ev::GlobalValue broG = ev::globalValue("bro");
            if (broG.found && ev::isObject(broG.value)) {
                ev::Persistent broP(broG.value);
                ev::Persistent fnP(ev::makeFunction([](ev::Value, std::span<const ev::Value> args) -> ev::Value {
                    if (!args.empty() && ev::isBool(args[0])) {
                        WindowsShellManager::setModalActive(ev::toBool(args[0]));
                    }
                    return ev::undefined();
                }, 1, "setModalActive"));
                broP.set(ev::setProperty(broP.get(), "setModalActive", fnP.get()));

                ev::Persistent compP(ev::getProperty(broP.get(), "compositor"));
                if (ev::isObject(compP.get())) {
                    compP.set(ev::setProperty(compP.get(), "setModalActive", fnP.get()));
                }
            }
        };
    }
    _putenv_s("BRO_TRUSTED_APP_DIR", config.appDir.c_str());
#endif
    bro::engine::publishLaunchEnv(config);

    try {
        bro::engine::Engine engine(config);
#if defined(_WIN32)
        if (isStandaloneShell) {
            if (engine.window()) {
                HWND hwnd = bro::platform::desktop::hwndOf(engine.window()->getSDLWindow());
                if (hwnd) {
                    WindowsShellManager::attachWindow(hwnd);
                }
            }
            engine.addFramePump([&engine]() {
                static bool attached = false;
                if (!attached && engine.window()) {
                    HWND hwnd = bro::platform::desktop::hwndOf(engine.window()->getSDLWindow());
                    if (hwnd) {
                        WindowsShellManager::attachWindow(hwnd);
                        attached = true;
                    }
                }
            });
        }
#endif
        engine.run();
    } catch (const std::exception& e) {
        LOG_ERROR("helm: fatal: %s", e.what());
        std::fprintf(stderr, "Fatal error: %s\n", e.what());
#if defined(_WIN32)
        WindowsShellManager::restore();
#endif
        return 1;
    }

#if defined(_WIN32)
    WindowsShellManager::restore();
#endif

    bro::bronze_host::flushHostStorage();
    return 0;
}
