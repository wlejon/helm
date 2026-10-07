#include "paths.h"

#include "engine/launcher.h"
#include "util/exe_dir.h"

#include <cstdlib>
#include <filesystem>
#include <system_error>

#ifdef _WIN32
#include <windows.h>
#endif

namespace helm {

namespace fs = std::filesystem;

std::string getEnv(const char* name) {
#ifdef _WIN32
    std::wstring wname(name, name + std::char_traits<char>::length(name));
    DWORD n = GetEnvironmentVariableW(wname.c_str(), nullptr, 0);
    if (n == 0) return {};
    std::wstring buf(n, L'\0');
    n = GetEnvironmentVariableW(wname.c_str(), buf.data(), n);
    buf.resize(n);
    int len = WideCharToMultiByte(CP_UTF8, 0, buf.data(), int(buf.size()), nullptr, 0, nullptr, nullptr);
    std::string out(size_t(len), '\0');
    WideCharToMultiByte(CP_UTF8, 0, buf.data(), int(buf.size()), out.data(), len, nullptr, nullptr);
    return out;
#else
    const char* v = std::getenv(name);
    return v ? std::string(v) : std::string();
#endif
}

namespace {

fs::path fromUtf8(const std::string& s) {
    return fs::path(std::u8string(s.begin(), s.end()));
}

std::string toUtf8(const fs::path& p) {
    std::u8string u = p.generic_u8string();
    return std::string(u.begin(), u.end());
}

std::string platformConfigDir() {
#if defined(_WIN32)
    std::string base = getEnv("APPDATA");
    if (base.empty()) base = getEnv("USERPROFILE");
    return base.empty() ? std::string() : toUtf8(fromUtf8(base) / "helm");
#elif defined(__APPLE__)
    std::string home = getEnv("HOME");
    return home.empty() ? std::string()
                        : toUtf8(fromUtf8(home) / "Library" / "Application Support" / "helm");
#else
    std::string xdg = getEnv("XDG_CONFIG_HOME");
    if (!xdg.empty() && fromUtf8(xdg).is_absolute()) return toUtf8(fromUtf8(xdg) / "helm");
    std::string home = getEnv("HOME");
    return home.empty() ? std::string() : toUtf8(fromUtf8(home) / ".config" / "helm");
#endif
}

} // namespace

std::string configDir() {
    std::string dir = getEnv("HELM_CONFIG_DIR");
    if (dir.empty()) dir = platformConfigDir();
    if (dir.empty()) dir = toUtf8(fs::temp_directory_path() / "helm");
    std::error_code ec;
    fs::path p = fromUtf8(dir);
    fs::create_directories(p, ec);
    fs::path abs = fs::absolute(p, ec);
    return toUtf8(ec ? p : abs);
}

bool locateUi(bro::engine::EngineConfig& config) {
    const std::string exe = bro::util::executableDir();
    // Installed, the UI sits in system/helm beside the executable: a location
    // bro trusts with the shell namespaces. Run from a build tree, it is the
    // source ui/ folder, which a developer names in BRO_TRUSTED_APP_DIR.
    for (const char* rel : { "/system/helm", "/../../ui", "/../ui" }) {
        if (bro::engine::resolveLaunchTarget(exe + rel, config)) return true;
    }
    if (bro::engine::resolveLaunchTarget("ui", config)) return true;
    return false;
}

} // namespace helm
