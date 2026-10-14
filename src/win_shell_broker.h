#pragma once

#include <cstdint>
#include <string>
#include <vector>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

namespace bro::engine {
class Engine;
}

namespace helm {

#if defined(_WIN32)

struct ShellWindowInfo {
    uint64_t hwnd = 0;
    std::string handleHex;
    std::string title;
    std::string className;
    uint32_t processId = 0;
    bool minimized = false;
    bool maximized = false;
    bool visible = false;
    int32_t x = 0;
    int32_t y = 0;
    int32_t width = 0;
    int32_t height = 0;
};

struct ShellHookEvent {
    std::string type;       // "windowCreated", "windowDestroyed", "windowActivated", "windowRedraw", "getMinRect", "rudeAppActivated", "windowFlash", etc.
    uint32_t code = 0;      // HSHELL_* numeric code
    std::string codeName;   // "HSHELL_WINDOWCREATED", etc.
    ShellWindowInfo window;
};

class WinShellBroker {
public:
    /// Initialize desktop work area reservation (bottom bar) and resolve user32 shell APIs.
    /// Shell_TrayWnd is intentionally left to brosys (TrayHost) so it claims TrayRole::Shell.
    static void init(int panelHeight = 48);

    /// Restore work area reservation and unhook windows.
    static void restore();

    /// Attach and subclass Helm's main window in standalone shell mode.
    /// Calls SetShellWindow, SetTaskmanWindow, RegisterShellHookWindow, and pins to HWND_BOTTOM.
    static void attachWindow(HWND hwnd);

    /// Elevate Helm to HWND_TOP and activate when modals/launchers are active;
    /// pin to HWND_BOTTOM with AllowSetForegroundWindow(ASFW_ANY) when inactive.
    static void setModalActive(bool active);

    /// Query whether a modal is currently active.
    static bool isModalActive();

    /// Check if Helm is officially registered as the Windows Shell Window (GetShellWindow() == attached hwnd).
    static bool isShellActive();

    /// Get current attached main HWND.
    static HWND attachedWindow();

    /// Get the current Shell_TrayWnd HWND (owned by brosys in standalone shell mode).
    static HWND trayWindow();

    /// Enumerate top-level application windows.
    static std::vector<ShellWindowInfo> enumerateWindows();

    /// Process and dispatch queued shell hook events to Bronze JS callbacks.
    /// Call this from the engine's frame pump on the JS thread.
    static void tick();

    /// Install Bronze JS host bindings (bro.shellHook, bro.setModalActive, bro.compositor.setModalActive).
    static void installHostBindings(bro::engine::Engine& engine);

private:
    static LRESULT CALLBACK shellSubclassProc(
        HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam,
        UINT_PTR uIdSubclass, DWORD_PTR dwRefData);

    static void handleShellHook(WPARAM wParam, LPARAM lParam);
    static ShellWindowInfo queryWindowInfo(HWND hwnd);
};

#else

// Fallback stubs for non-Windows platforms
class WinShellBroker {
public:
    static void init(int /*panelHeight*/ = 48) {}
    static void restore() {}
    static void attachWindow(void* /*hwnd*/) {}
    static void setModalActive(bool /*active*/) {}
    static bool isModalActive() { return false; }
    static bool isShellActive() { return false; }
    static void tick() {}
    static void installHostBindings(bro::engine::Engine& /*engine*/) {}
};

#endif

} // namespace helm
