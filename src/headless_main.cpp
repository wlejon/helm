#include "desktop/desktop_host.h"
#include "paths.h"

#include "bronze_host/host_storage.h"
#include "engine/capabilities.h"
#include "engine/headless_driver.h"
#include "util/crash_handler.h"
#include "util/exe_dir.h"

#include <cstring>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace {

namespace fs = std::filesystem;

bool takesValue(std::string_view arg) {
    return arg == "--width" || arg == "--height" || arg == "--device-scale-factor" ||
           arg == "--script-log" || arg == "-e" || arg == "--notification" ||
           arg == "--print-native-manifest" || arg == "--grant" ||
           arg == "--aot-build" || arg == "--aot";
}

fs::path canonicalish(const fs::path& p) {
    std::error_code ec;
    fs::path abs = fs::absolute(p, ec);
    fs::path wc = fs::weakly_canonical(ec ? p : abs, ec);
    return (ec ? (abs.empty() ? p : abs) : wc).lexically_normal();
}

bool isHelmShellUiTarget(const std::string& target) {
    if (target.empty()) return false;
    const fs::path targetPath = canonicalish(
        fs::path(std::u8string(target.begin(), target.end())));
    const std::string exeDir = bro::util::executableDir();
    std::vector<fs::path> shellDirs = {
        canonicalish(fs::path(exeDir) / "system" / "helm"),
        canonicalish(fs::path(exeDir) / "ui"),
        canonicalish(fs::path(exeDir) / ".." / "ui"),
        canonicalish(fs::path(exeDir) / ".." / ".." / "ui"),
    };
#ifdef HELM_SOURCE_UI_DIR
    shellDirs.push_back(canonicalish(fs::path(HELM_SOURCE_UI_DIR)));
#endif
    for (const fs::path& dir : shellDirs) {
        if (!dir.empty() && targetPath == dir) return true;
    }
    return false;
}

}  // namespace

int main(int argc, char* argv[]) {
    bro::util::installCrashHandler("helm-headless");

    bool grantShell = false;
    std::string appTarget;
    std::vector<char*> forwarded;
    forwarded.reserve(static_cast<size_t>(argc));
    if (argc > 0) forwarded.push_back(argv[0]);

    bool expectValue = false;
    bool passThrough = false;
    for (int i = 1; i < argc; ++i) {
        std::string_view a(argv[i]);
        if (!passThrough && a == "--shell-grants") {
            grantShell = true;
            continue;
        }
        forwarded.push_back(argv[i]);
        if (passThrough) continue;
        if (a == "--") { passThrough = true; continue; }
        if (expectValue) { expectValue = false; continue; }
        if (takesValue(a)) { expectValue = true; continue; }
        if (!a.empty() && a.front() != '-' && appTarget.empty()) {
            appTarget = std::string(a);
        }
    }

    bro::engine::HeadlessHooks hooks;
    hooks.programName = "helm-headless";
    hooks.tagline = "the helm desktop environment and desktop app runner";
    hooks.installHostRootApis = helm::desktop::installDesktopRootApis;
    hooks.installWorkerHostBindings = helm::desktop::installDesktopWorkerApis;
    hooks.onDropCompartment = helm::desktop::dropDesktopCompartment;
    hooks.onShutdownForReload = helm::desktop::shutdownDesktopForReload;
    hooks.beforeExit = [] {
        helm::desktop::flushDesktopForExit();
        bro::bronze_host::flushHostStorage();
    };
    if (grantShell || isHelmShellUiTarget(appTarget)) {
        hooks.hostGrants = bro::engine::allCapabilityNames();
    }
    return bro::engine::runHeadless(static_cast<int>(forwarded.size()), forwarded.data(), hooks);
}
