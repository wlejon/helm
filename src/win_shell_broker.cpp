#include "win_shell_broker.h"

#if defined(_WIN32)
#include "util/log.h"
#include "embed/embed.h"

#include <commctrl.h>
#pragma comment(lib, "comctl32.lib")

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <string_view>
#include <vector>

namespace helm {

namespace {

using PFN_SetShellWindow = BOOL(WINAPI*)(HWND);
using PFN_SetTaskmanWindow = BOOL(WINAPI*)(HWND);
using PFN_RegisterShellHookWindow = BOOL(WINAPI*)(HWND);
using PFN_DeregisterShellHookWindow = BOOL(WINAPI*)(HWND);

struct ShellHookListener {
    uint64_t id = 0;
    std::string eventType;
    std::shared_ptr<bronze::embed::Persistent> callback;
};

// Global broker state
RECT s_originalWorkArea{};
bool s_hasReserved = false;
HWND s_hwnd = nullptr;
bool s_subclassed = false;
bool s_modalActive = false;

HWND s_trayHwnd = nullptr;
bool s_trayClassRegistered = false;
UINT s_wmShellHook = 0;
bool s_shellHookRegistered = false;

PFN_SetShellWindow s_pfnSetShellWindow = nullptr;
PFN_SetTaskmanWindow s_pfnSetTaskmanWindow = nullptr;
PFN_RegisterShellHookWindow s_pfnRegisterShellHookWindow = nullptr;
PFN_DeregisterShellHookWindow s_pfnDeregisterShellHookWindow = nullptr;
bool s_procsResolved = false;

std::mutex s_eventsMutex;
std::vector<ShellHookEvent> s_pendingEvents;

std::vector<ShellHookListener> s_listeners;
uint64_t s_nextListenerId = 1;

void resolveProcs() {
    if (s_procsResolved) return;
    s_procsResolved = true;
    HMODULE hUser32 = GetModuleHandleW(L"user32.dll");
    if (!hUser32) {
        hUser32 = LoadLibraryW(L"user32.dll");
    }
    if (hUser32) {
        s_pfnSetShellWindow = reinterpret_cast<PFN_SetShellWindow>(GetProcAddress(hUser32, "SetShellWindow"));
        s_pfnSetTaskmanWindow = reinterpret_cast<PFN_SetTaskmanWindow>(GetProcAddress(hUser32, "SetTaskmanWindow"));
        s_pfnRegisterShellHookWindow = reinterpret_cast<PFN_RegisterShellHookWindow>(GetProcAddress(hUser32, "RegisterShellHookWindow"));
        s_pfnDeregisterShellHookWindow = reinterpret_cast<PFN_DeregisterShellHookWindow>(GetProcAddress(hUser32, "DeregisterShellHookWindow"));
        LOG_INFO("WinShellBroker: resolved user32 procs (SetShellWindow=%p, SetTaskmanWindow=%p, RegisterShellHookWindow=%p)",
                 (void*)s_pfnSetShellWindow, (void*)s_pfnSetTaskmanWindow, (void*)s_pfnRegisterShellHookWindow);
    }
}

std::string toUtf8(std::wstring_view wstr) {
    if (wstr.empty()) return {};
    int sizeNeeded = WideCharToMultiByte(CP_UTF8, 0, wstr.data(), static_cast<int>(wstr.size()),
                                         nullptr, 0, nullptr, nullptr);
    if (sizeNeeded <= 0) return {};
    std::string result(sizeNeeded, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr.data(), static_cast<int>(wstr.size()),
                        result.data(), sizeNeeded, nullptr, nullptr);
    return result;
}

bronze::embed::Value windowInfoToJs(const ShellWindowInfo& info) {
    namespace ev = bronze::embed;
    ev::Persistent objP(ev::createObject());

    objP.set(ev::setProperty(objP.get(), "id", ev::fromDouble(static_cast<double>(info.hwnd))));
    objP.set(ev::setProperty(objP.get(), "hwnd", ev::fromDouble(static_cast<double>(info.hwnd))));

    ev::Persistent hexP(ev::fromUtf8(info.handleHex));
    objP.set(ev::setProperty(objP.get(), "handle", hexP.get()));

    ev::Persistent titleP(ev::fromUtf8(info.title));
    objP.set(ev::setProperty(objP.get(), "title", titleP.get()));

    ev::Persistent classP(ev::fromUtf8(info.className));
    objP.set(ev::setProperty(objP.get(), "className", classP.get()));

    objP.set(ev::setProperty(objP.get(), "processId", ev::fromDouble(static_cast<double>(info.processId))));
    objP.set(ev::setProperty(objP.get(), "minimized", ev::fromBool(info.minimized)));
    objP.set(ev::setProperty(objP.get(), "maximized", ev::fromBool(info.maximized)));
    objP.set(ev::setProperty(objP.get(), "visible", ev::fromBool(info.visible)));

    ev::Persistent rectP(ev::createObject());
    rectP.set(ev::setProperty(rectP.get(), "x", ev::fromDouble(static_cast<double>(info.x))));
    rectP.set(ev::setProperty(rectP.get(), "y", ev::fromDouble(static_cast<double>(info.y))));
    rectP.set(ev::setProperty(rectP.get(), "width", ev::fromDouble(static_cast<double>(info.width))));
    rectP.set(ev::setProperty(rectP.get(), "height", ev::fromDouble(static_cast<double>(info.height))));
    objP.set(ev::setProperty(objP.get(), "rect", rectP.get()));

    return objP.get();
}

bronze::embed::Value shellHookEventToJs(const ShellHookEvent& evItem) {
    namespace ev = bronze::embed;
    ev::Persistent objP(ev::createObject());

    ev::Persistent typeP(ev::fromUtf8(evItem.type));
    objP.set(ev::setProperty(objP.get(), "type", typeP.get()));

    objP.set(ev::setProperty(objP.get(), "code", ev::fromDouble(static_cast<double>(evItem.code))));

    ev::Persistent codeNameP(ev::fromUtf8(evItem.codeName));
    objP.set(ev::setProperty(objP.get(), "codeName", codeNameP.get()));

    ev::Persistent winP(windowInfoToJs(evItem.window));
    objP.set(ev::setProperty(objP.get(), "window", winP.get()));

    // Flatten window attributes onto event for convenient JS access
    objP.set(ev::setProperty(objP.get(), "id", ev::fromDouble(static_cast<double>(evItem.window.hwnd))));
    objP.set(ev::setProperty(objP.get(), "hwnd", ev::fromDouble(static_cast<double>(evItem.window.hwnd))));

    ev::Persistent hexP(ev::fromUtf8(evItem.window.handleHex));
    objP.set(ev::setProperty(objP.get(), "handle", hexP.get()));

    ev::Persistent titleP(ev::fromUtf8(evItem.window.title));
    objP.set(ev::setProperty(objP.get(), "title", titleP.get()));

    ev::Persistent classP(ev::fromUtf8(evItem.window.className));
    objP.set(ev::setProperty(objP.get(), "className", classP.get()));

    objP.set(ev::setProperty(objP.get(), "processId", ev::fromDouble(static_cast<double>(evItem.window.processId))));
    objP.set(ev::setProperty(objP.get(), "minimized", ev::fromBool(evItem.window.minimized)));
    objP.set(ev::setProperty(objP.get(), "maximized", ev::fromBool(evItem.window.maximized)));
    objP.set(ev::setProperty(objP.get(), "visible", ev::fromBool(evItem.window.visible)));

    ev::Persistent rectP(ev::createObject());
    rectP.set(ev::setProperty(rectP.get(), "x", ev::fromDouble(static_cast<double>(evItem.window.x))));
    rectP.set(ev::setProperty(rectP.get(), "y", ev::fromDouble(static_cast<double>(evItem.window.y))));
    rectP.set(ev::setProperty(rectP.get(), "width", ev::fromDouble(static_cast<double>(evItem.window.width))));
    rectP.set(ev::setProperty(rectP.get(), "height", ev::fromDouble(static_cast<double>(evItem.window.height))));
    objP.set(ev::setProperty(objP.get(), "rect", rectP.get()));

    return objP.get();
}

} // namespace

void WinShellBroker::init(int panelHeight) {
    resolveProcs();

    HMONITOR hMon = MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO mi{};
    mi.cbSize = sizeof(mi);
    if (GetMonitorInfoW(hMon, &mi)) {
        s_originalWorkArea = mi.rcWork;
        RECT newWork = mi.rcMonitor;
        newWork.top += panelHeight;
        SystemParametersInfoW(SPI_SETWORKAREA, 0, &newWork, SPIF_SENDCHANGE);
        s_hasReserved = true;
        LOG_INFO("WinShellBroker: reserved work area top +%d px", panelHeight);
    }

    // Register Shell_TrayWnd message receiver window to fulfill Explorer contracts
    if (!FindWindowW(L"Shell_TrayWnd", nullptr)) {
        WNDCLASSEXW wc{};
        wc.cbSize = sizeof(wc);
        wc.lpfnWndProc = trayWndProc;
        wc.hInstance = GetModuleHandleW(nullptr);
        wc.lpszClassName = L"Shell_TrayWnd";
        if (RegisterClassExW(&wc) || GetLastError() == ERROR_CLASS_ALREADY_EXISTS) {
            s_trayClassRegistered = true;
            s_trayHwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                L"Shell_TrayWnd",
                L"",
                WS_POPUP,
                0, 0, 0, 0,
                nullptr, nullptr,
                GetModuleHandleW(nullptr),
                nullptr
            );
            if (s_trayHwnd) {
                LOG_INFO("WinShellBroker: created Shell_TrayWnd receiver window %p", (void*)s_trayHwnd);
                UINT wmTaskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
                if (wmTaskbarCreated != 0) {
                    SendNotifyMessageW(HWND_BROADCAST, wmTaskbarCreated, 0, 0);
                    LOG_INFO("WinShellBroker: broadcasted TaskbarCreated message (%u)", wmTaskbarCreated);
                }
            } else {
                LOG_WARN("WinShellBroker: failed to create Shell_TrayWnd: error %lu", GetLastError());
            }
        }
    } else {
        LOG_INFO("WinShellBroker: Shell_TrayWnd already exists in session");
    }

    s_wmShellHook = RegisterWindowMessageW(L"SHELLHOOK");
    LOG_INFO("WinShellBroker: registered WM_SHELLHOOK message ID (%u)", s_wmShellHook);
}

void WinShellBroker::restore() {
    if (s_hwnd && s_subclassed) {
        if (s_pfnDeregisterShellHookWindow && s_shellHookRegistered) {
            s_pfnDeregisterShellHookWindow(s_hwnd);
            s_shellHookRegistered = false;
        }
        RemoveWindowSubclass(s_hwnd, shellSubclassProc, 1);
        s_subclassed = false;
        s_hwnd = nullptr;
    }
    if (s_trayHwnd) {
        DestroyWindow(s_trayHwnd);
        s_trayHwnd = nullptr;
    }
    if (s_trayClassRegistered) {
        UnregisterClassW(L"Shell_TrayWnd", GetModuleHandleW(nullptr));
        s_trayClassRegistered = false;
    }
    if (s_hasReserved) {
        SystemParametersInfoW(SPI_SETWORKAREA, 0, &s_originalWorkArea, SPIF_SENDCHANGE);
        s_hasReserved = false;
    }
    s_listeners.clear();
    {
        std::lock_guard<std::mutex> lock(s_eventsMutex);
        s_pendingEvents.clear();
    }
    LOG_INFO("WinShellBroker: restored desktop state and unhooked window");
}

void WinShellBroker::attachWindow(HWND hwnd) {
    if (!hwnd || s_subclassed) return;
    s_hwnd = hwnd;
    resolveProcs();

    // 1. SetShellWindow: registers Helm's HWND in win32k so GetShellWindow() == hwnd
    if (s_pfnSetShellWindow) {
        BOOL ok = s_pfnSetShellWindow(hwnd);
        LOG_INFO("WinShellBroker: SetShellWindow(%p) -> %s (GetLastError=%lu, GetShellWindow=%p)",
                 (void*)hwnd, ok ? "SUCCESS" : "FAILED", GetLastError(), (void*)GetShellWindow());
    } else {
        LOG_WARN("WinShellBroker: SetShellWindow not resolved");
    }

    // 2. SetTaskmanWindow: registers task manager window for win32k task switching
    if (s_pfnSetTaskmanWindow) {
        BOOL ok = s_pfnSetTaskmanWindow(hwnd);
        LOG_INFO("WinShellBroker: SetTaskmanWindow(%p) -> %s (GetLastError=%lu)",
                 (void*)hwnd, ok ? "SUCCESS" : "FAILED", GetLastError());
    } else {
        LOG_WARN("WinShellBroker: SetTaskmanWindow not resolved");
    }

    // 3. RegisterShellHookWindow: registers for WM_SHELLHOOK messages
    if (s_pfnRegisterShellHookWindow) {
        BOOL ok = s_pfnRegisterShellHookWindow(hwnd);
        s_shellHookRegistered = (ok != FALSE);
        LOG_INFO("WinShellBroker: RegisterShellHookWindow(%p) -> %s (GetLastError=%lu)",
                 (void*)hwnd, ok ? "SUCCESS" : "FAILED", GetLastError());
    } else {
        LOG_WARN("WinShellBroker: RegisterShellHookWindow not resolved");
    }

    // 4. Subclass window and pin beneath normal applications
    if (SetWindowSubclass(hwnd, shellSubclassProc, 1, 0)) {
        s_subclassed = true;
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        LOG_INFO("WinShellBroker: subclassed HWND %p and pinned to HWND_BOTTOM", (void*)hwnd);
    }
}

void WinShellBroker::setModalActive(bool active) {
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

bool WinShellBroker::isModalActive() {
    return s_modalActive;
}

bool WinShellBroker::isShellActive() {
    return s_hwnd != nullptr && GetShellWindow() == s_hwnd;
}

HWND WinShellBroker::attachedWindow() {
    return s_hwnd;
}

HWND WinShellBroker::trayWindow() {
    return s_trayHwnd;
}

ShellWindowInfo WinShellBroker::queryWindowInfo(HWND hwnd) {
    ShellWindowInfo info;
    if (!hwnd) return info;
    info.hwnd = reinterpret_cast<uintptr_t>(hwnd);
    char hexBuf[32];
    std::snprintf(hexBuf, sizeof(hexBuf), "0x%p", (void*)hwnd);
    info.handleHex = hexBuf;

    if (IsWindow(hwnd)) {
        wchar_t titleBuf[512]{};
        if (GetWindowTextW(hwnd, titleBuf, 512) > 0) {
            info.title = toUtf8(titleBuf);
        }
        wchar_t classBuf[256]{};
        if (GetClassNameW(hwnd, classBuf, 256) > 0) {
            info.className = toUtf8(classBuf);
        }
        DWORD pid = 0;
        GetWindowThreadProcessId(hwnd, &pid);
        info.processId = pid;
        RECT r{};
        if (GetWindowRect(hwnd, &r)) {
            info.x = r.left;
            info.y = r.top;
            info.width = r.right - r.left;
            info.height = r.bottom - r.top;
        }
        info.minimized = IsIconic(hwnd) != FALSE;
        info.maximized = IsZoomed(hwnd) != FALSE;
        info.visible = IsWindowVisible(hwnd) != FALSE;
    }
    return info;
}

std::vector<ShellWindowInfo> WinShellBroker::enumerateWindows() {
    struct Context {
        std::vector<ShellWindowInfo> list;
        HWND shellHwnd;
        HWND trayHwnd;
    };
    Context ctx;
    ctx.shellHwnd = s_hwnd;
    ctx.trayHwnd = s_trayHwnd;

    EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
        auto* p = reinterpret_cast<Context*>(lParam);
        if (hwnd == p->shellHwnd || hwnd == p->trayHwnd) return TRUE;
        if (!IsWindowVisible(hwnd)) return TRUE;

        LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if (exStyle & WS_EX_TOOLWINDOW) {
            if (!(exStyle & WS_EX_APPWINDOW)) return TRUE;
        }
        HWND owner = GetWindow(hwnd, GW_OWNER);
        if (owner && !(exStyle & WS_EX_APPWINDOW)) return TRUE;

        p->list.push_back(queryWindowInfo(hwnd));
        return TRUE;
    }, reinterpret_cast<LPARAM>(&ctx));

    return ctx.list;
}

void WinShellBroker::handleShellHook(WPARAM wParam, LPARAM lParam) {
    std::string typeStr;
    std::string codeName;

    switch (wParam) {
        case HSHELL_WINDOWCREATED:
            typeStr = "windowCreated";
            codeName = "HSHELL_WINDOWCREATED";
            break;
        case HSHELL_WINDOWDESTROYED:
            typeStr = "windowDestroyed";
            codeName = "HSHELL_WINDOWDESTROYED";
            break;
        case HSHELL_ACTIVATESHELLWINDOW:
            typeStr = "activateShell";
            codeName = "HSHELL_ACTIVATESHELLWINDOW";
            break;
        case HSHELL_WINDOWACTIVATED:
            typeStr = "windowActivated";
            codeName = "HSHELL_WINDOWACTIVATED";
            break;
        case HSHELL_RUDEAPPACTIVATED:
            typeStr = "windowActivated";
            codeName = "HSHELL_RUDEAPPACTIVATED";
            break;
        case HSHELL_GETMINRECT:
            typeStr = "getMinRect";
            codeName = "HSHELL_GETMINRECT";
            break;
        case HSHELL_REDRAW:
            typeStr = "windowRedraw";
            codeName = "HSHELL_REDRAW";
            break;
        case HSHELL_TASKMAN:
            typeStr = "taskman";
            codeName = "HSHELL_TASKMAN";
            break;
        case HSHELL_FLASH:
            typeStr = "windowFlash";
            codeName = "HSHELL_FLASH";
            break;
        default:
            typeStr = "shellHook";
            codeName = "HSHELL_" + std::to_string(wParam);
            break;
    }

    HWND target = nullptr;
    RECT rcMin{};
    if (wParam == HSHELL_GETMINRECT && lParam) {
        auto* shi = reinterpret_cast<SHELLHOOKINFO*>(lParam);
        if (shi) {
            target = shi->hwnd;
            rcMin = shi->rc;
        }
    } else {
        target = reinterpret_cast<HWND>(lParam);
    }

    // Filter out Helm's own window and tray window from being tracked as external apps
    const bool isSelf = (target == s_hwnd || target == s_trayHwnd);
    if (isSelf && (wParam == HSHELL_WINDOWCREATED || wParam == HSHELL_WINDOWDESTROYED)) {
        return;
    }

    ShellHookEvent ev;
    ev.type = typeStr;
    ev.code = static_cast<uint32_t>(wParam);
    ev.codeName = codeName;
    ev.window = queryWindowInfo(target);
    if (wParam == HSHELL_GETMINRECT && lParam) {
        ev.window.x = rcMin.left;
        ev.window.y = rcMin.top;
        ev.window.width = rcMin.right - rcMin.left;
        ev.window.height = rcMin.bottom - rcMin.top;
    }

    {
        std::lock_guard<std::mutex> lock(s_eventsMutex);
        s_pendingEvents.push_back(std::move(ev));
    }
}

LRESULT CALLBACK WinShellBroker::shellSubclassProc(
    HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam,
    UINT_PTR uIdSubclass, DWORD_PTR dwRefData) {

    switch (uMsg) {
        case WM_MOUSEACTIVATE: {
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
            if (s_pfnDeregisterShellHookWindow && s_shellHookRegistered) {
                s_pfnDeregisterShellHookWindow(hWnd);
                s_shellHookRegistered = false;
            }
            RemoveWindowSubclass(hWnd, shellSubclassProc, uIdSubclass);
            s_subclassed = false;
            s_hwnd = nullptr;
            break;
        }

        default: {
            if (s_wmShellHook != 0 && uMsg == s_wmShellHook) {
                handleShellHook(wParam, lParam);
                return 0;
            }
            break;
        }
    }

    return DefSubclassProc(hWnd, uMsg, wParam, lParam);
}

LRESULT CALLBACK WinShellBroker::trayWndProc(
    HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    switch (uMsg) {
        case WM_DESTROY:
            return 0;
        default:
            return DefWindowProcW(hWnd, uMsg, wParam, lParam);
    }
}

void WinShellBroker::tick() {
    std::vector<ShellHookEvent> pending;
    {
        std::lock_guard<std::mutex> lock(s_eventsMutex);
        if (s_pendingEvents.empty()) return;
        pending.swap(s_pendingEvents);
    }

    namespace ev = bronze::embed;
    for (const auto& evItem : pending) {
        ev::Persistent payload(shellHookEventToJs(evItem));
        for (const auto& l : s_listeners) {
            if (l.callback && ev::isFunction(l.callback->get())) {
                if (l.eventType == "*" || l.eventType == evItem.type ||
                    (l.eventType == "windowAdded" && evItem.type == "windowCreated") ||
                    (l.eventType == "windowRemoved" && evItem.type == "windowDestroyed") ||
                    (l.eventType == "focusChanged" && evItem.type == "windowActivated")) {
                    ev::Value arg = payload.get();
                    ev::call(l.callback->get(), ev::undefined(), std::span<const ev::Value>(&arg, 1));
                }
            }
        }
    }
    if (ev::microtasksPending()) {
        ev::drainMicrotasks();
    }
}

void WinShellBroker::installHostBindings(bro::engine::Engine& /*engine*/) {
    namespace ev = bronze::embed;
    ev::GlobalValue broG = ev::globalValue("bro");
    if (!broG.found || !ev::isObject(broG.value)) return;
    ev::Persistent broP(broG.value);

    // 1. bro.setModalActive
    ev::Persistent fnModal(ev::makeFunction([](ev::Value, std::span<const ev::Value> args) -> ev::Value {
        if (!args.empty() && ev::isBool(args[0])) {
            WinShellBroker::setModalActive(ev::toBool(args[0]));
        }
        return ev::undefined();
    }, 1, "setModalActive"));
    broP.set(ev::setProperty(broP.get(), "setModalActive", fnModal.get()));

    ev::Persistent compP(ev::getProperty(broP.get(), "compositor"));
    if (ev::isObject(compP.get())) {
        compP.set(ev::setProperty(compP.get(), "setModalActive", fnModal.get()));
    }

    // 2. bro.shellHook namespace
    ev::Persistent hookObj(ev::createObject());
    hookObj.set(ev::setProperty(hookObj.get(), "available", ev::fromBool(true)));

    // bro.shellHook.isShellActive()
    ev::Persistent fnIsActive(ev::makeFunction([](ev::Value, std::span<const ev::Value>) -> ev::Value {
        return ev::fromBool(WinShellBroker::isShellActive());
    }, 0, "isShellActive"));
    hookObj.set(ev::setProperty(hookObj.get(), "isShellActive", fnIsActive.get()));

    // bro.shellHook.on(typeOrCb, cb?)
    ev::Persistent fnOn(ev::makeFunction([](ev::Value, std::span<const ev::Value> args) -> ev::Value {
        if (args.empty()) return ev::undefined();
        std::string eventType = "*";
        ev::Value callbackVal = ev::undefined();
        if (args.size() == 1 && ev::isFunction(args[0])) {
            callbackVal = args[0];
        } else if (args.size() >= 2 && ev::isFunction(args[1])) {
            if (ev::isString(args[0])) {
                eventType = ev::toUtf8(args[0]);
            }
            callbackVal = args[1];
        }
        if (ev::isFunction(callbackVal)) {
            ShellHookListener l;
            l.id = s_nextListenerId++;
            l.eventType = std::move(eventType);
            l.callback = std::make_shared<ev::Persistent>(callbackVal);
            s_listeners.push_back(std::move(l));
        }
        return ev::undefined();
    }, 2, "on"));
    hookObj.set(ev::setProperty(hookObj.get(), "on", fnOn.get()));
    hookObj.set(ev::setProperty(hookObj.get(), "addListener", fnOn.get()));

    // bro.shellHook.off(cb)
    ev::Persistent fnOff(ev::makeFunction([](ev::Value, std::span<const ev::Value> args) -> ev::Value {
        if (args.empty() || !ev::isFunction(args[0])) return ev::undefined();
        uint64_t targetBits = ev::toBits(args[0]);
        std::erase_if(s_listeners, [targetBits](const ShellHookListener& l) {
            return l.callback && ev::toBits(l.callback->get()) == targetBits;
        });
        return ev::undefined();
    }, 1, "off"));
    hookObj.set(ev::setProperty(hookObj.get(), "off", fnOff.get()));
    hookObj.set(ev::setProperty(hookObj.get(), "removeListener", fnOff.get()));

    // bro.shellHook.getWindows()
    ev::Persistent fnGetWindows(ev::makeFunction([](ev::Value, std::span<const ev::Value>) -> ev::Value {
        if (std::getenv("HELM_TEST")) {
            return ev::makeArray(0);
        }
        auto wins = WinShellBroker::enumerateWindows();
        ev::Persistent arr(ev::makeArray(static_cast<uint32_t>(wins.size())));
        for (uint32_t i = 0; i < wins.size(); ++i) {
            ev::Persistent wObj(windowInfoToJs(wins[i]));
            ev::setElement(arr.get(), i, wObj.get());
        }
        return arr.get();
    }, 0, "getWindows"));
    hookObj.set(ev::setProperty(hookObj.get(), "getWindows", fnGetWindows.get()));

    // bro.shellHook.focusWindow(hwndOrId)
    ev::Persistent fnFocus(ev::makeFunction([](ev::Value, std::span<const ev::Value> args) -> ev::Value {
        if (args.empty()) return ev::fromBool(false);
        HWND target = nullptr;
        if (ev::isNumber(args[0])) {
            target = reinterpret_cast<HWND>(static_cast<uintptr_t>(ev::toDouble(args[0])));
        } else if (ev::isString(args[0])) {
            std::string s = ev::toUtf8(args[0]);
            target = reinterpret_cast<HWND>(std::strtoull(s.c_str(), nullptr, 0));
        }
        if (target && IsWindow(target)) {
            if (IsIconic(target)) {
                ShowWindow(target, SW_RESTORE);
            }
            SetForegroundWindow(target);
            return ev::fromBool(true);
        }
        return ev::fromBool(false);
    }, 1, "focusWindow"));
    hookObj.set(ev::setProperty(hookObj.get(), "focusWindow", fnFocus.get()));

    // bro.shellHook.closeWindow(hwndOrId)
    ev::Persistent fnClose(ev::makeFunction([](ev::Value, std::span<const ev::Value> args) -> ev::Value {
        if (args.empty()) return ev::fromBool(false);
        HWND target = nullptr;
        if (ev::isNumber(args[0])) {
            target = reinterpret_cast<HWND>(static_cast<uintptr_t>(ev::toDouble(args[0])));
        } else if (ev::isString(args[0])) {
            std::string s = ev::toUtf8(args[0]);
            target = reinterpret_cast<HWND>(std::strtoull(s.c_str(), nullptr, 0));
        }
        if (target && IsWindow(target)) {
            PostMessageW(target, WM_CLOSE, 0, 0);
            return ev::fromBool(true);
        }
        return ev::fromBool(false);
    }, 1, "closeWindow"));
    hookObj.set(ev::setProperty(hookObj.get(), "closeWindow", fnClose.get()));

    broP.set(ev::setProperty(broP.get(), "shellHook", hookObj.get()));
    if (ev::isObject(compP.get())) {
        compP.set(ev::setProperty(compP.get(), "shellHook", hookObj.get()));
    }

    LOG_INFO("WinShellBroker: installed bro.shellHook and modal bindings onto Bronze JS host");
}

} // namespace helm

#endif // _WIN32
