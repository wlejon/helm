#include "desktop/host_conf_hooks.h"

#include "bronze_host/host_builder.h"
#include "bronze_host/host_compartment.h"
#include "bronze_host/host_runtime.h"
#include "engine/engine.h"

#include "embed/embed_access.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <optional>
#include <random>
#include <sstream>
#include <string>
#include <string_view>
#include <sys/stat.h>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace helm::desktop {

namespace fs = std::filesystem;
namespace ev = bronze::embed;
namespace engine = bro::engine;
using bronze::Value;
using bro::bronze_host::Compartment;
using bro::bronze_host::EntryKind;
using bro::bronze_host::ObjectBuilder;
using bro::bronze_host::argAt;
using bro::bronze_host::compartmentById;
using bro::bronze_host::currentCompartmentId;
using bro::bronze_host::hostArrayOf;
using bro::bronze_host::reportBronzeError;
using bro::bronze_host::runEntry;

namespace {

struct FileStamp {
    bool exists = false;
    uint64_t size = 0;
    int64_t mtimeNs = 0;
    uint64_t inode = 0;

    bool operator==(const FileStamp& o) const noexcept {
        return exists == o.exists && size == o.size && mtimeNs == o.mtimeNs && inode == o.inode;
    }
};

FileStamp statFile(const fs::path& p) {
    FileStamp st;
#if defined(_WIN32)
    WIN32_FILE_ATTRIBUTE_DATA fad{};
    if (!GetFileAttributesExW(p.c_str(), GetFileExInfoStandard, &fad)) return st;
    if (fad.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) return st;
    st.exists = true;
    st.size = (static_cast<uint64_t>(fad.nFileSizeHigh) << 32) | fad.nFileSizeLow;
    st.mtimeNs = (static_cast<int64_t>(fad.ftLastWriteTime.dwHighDateTime) << 32) |
                 fad.ftLastWriteTime.dwLowDateTime;
#else
    struct stat sb{};
    if (::stat(p.c_str(), &sb) != 0 || !S_ISREG(sb.st_mode)) return st;
    st.exists = true;
    st.size = static_cast<uint64_t>(sb.st_size);
    st.inode = static_cast<uint64_t>(sb.st_ino);
#if defined(__APPLE__)
    st.mtimeNs = static_cast<int64_t>(sb.st_mtimespec.tv_sec) * 1000000000LL + sb.st_mtimespec.tv_nsec;
#else
    st.mtimeNs = static_cast<int64_t>(sb.st_mtim.tv_sec) * 1000000000LL + sb.st_mtim.tv_nsec;
#endif
#endif
    return st;
}

std::string readFileString(const fs::path& p) {
    std::error_code ec;
    if (!fs::exists(p, ec) || !fs::is_regular_file(p, ec)) return {};
    std::ifstream in(p, std::ios::in | std::ios::binary);
    if (!in.is_open()) return {};
    return std::string((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

std::string trimView(std::string_view sv) {
    while (!sv.empty() && std::isspace(static_cast<unsigned char>(sv.front()))) sv.remove_prefix(1);
    while (!sv.empty() && std::isspace(static_cast<unsigned char>(sv.back()))) sv.remove_suffix(1);
    return std::string(sv);
}

using IniSections = std::map<std::string, std::map<std::string, std::string>>;

IniSections parseIni(std::string_view content) {
    IniSections sections;
    std::string current;
    size_t pos = 0;
    while (pos < content.size()) {
        size_t nl = content.find('\n', pos);
        std::string_view rawLine = (nl == std::string_view::npos) ? content.substr(pos) : content.substr(pos, nl - pos);
        pos = (nl == std::string_view::npos) ? content.size() : nl + 1;
        std::string line = trimView(rawLine);
        if (line.empty() || line.front() == '#' || line.front() == ';') continue;
        if (line.front() == '[' && line.back() == ']') {
            current = trimView(std::string_view(line).substr(1, line.size() - 2));
            sections[current];
            continue;
        }
        size_t eq = line.find('=');
        if (eq == std::string::npos) eq = line.find(':');
        if (eq != std::string::npos && !current.empty()) {
            std::string k = trimView(std::string_view(line).substr(0, eq));
            std::string v = trimView(std::string_view(line).substr(eq + 1));
            if (!k.empty()) sections[current][std::move(k)] = std::move(v);
        }
    }
    return sections;
}

std::string serializeIni(const IniSections& sections) {
    std::ostringstream ss;
    bool first = true;
    for (const auto& [sec, keys] : sections) {
        if (!first) ss << '\n';
        first = false;
        ss << '[' << sec << "]\n";
        for (const auto& [k, v] : keys) ss << k << " = " << v << '\n';
    }
    return ss.str();
}

bool writeFileAtomic(const fs::path& path, const std::string& text) {
    std::error_code ec;
    fs::path parent = path.parent_path();
    if (!parent.empty() && !fs::exists(parent, ec)) {
        if (!fs::create_directories(parent, ec) && ec) return false;
    }
    thread_local std::mt19937_64 rng{static_cast<uint64_t>(
        std::chrono::steady_clock::now().time_since_epoch().count())};
    fs::path tmpPath = parent / ("." + path.filename().string() + ".tmp." + std::to_string(rng()));

#if defined(_WIN32)
    FILE* f = _wfopen(tmpPath.c_str(), L"wb");
#else
    FILE* f = std::fopen(tmpPath.c_str(), "wb");
#endif
    if (!f) return false;

    const size_t written = std::fwrite(text.data(), 1, text.size(), f);
    if (written != text.size()) {
        std::fclose(f);
        fs::remove(tmpPath, ec);
        return false;
    }
    std::fflush(f);
#if !defined(_WIN32)
    const int fd = fileno(f);
    if (fd >= 0) ::fsync(fd);
#endif
    std::fclose(f);

    fs::rename(tmpPath, path, ec);
#if defined(_WIN32)
    for (int attempt = 0; ec && attempt < 100; ++attempt) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        ec.clear();
        fs::rename(tmpPath, path, ec);
    }
#endif
    if (ec) {
        std::error_code ignored;
        fs::remove(tmpPath, ignored);
        return false;
    }
    return true;
}

fs::path defaultUserConfigPath() {
    const char* appHome = std::getenv("BRO_APP_HOME");
    if (appHome && *appHome) {
        return fs::absolute(fs::path(std::u8string(appHome, appHome + std::strlen(appHome)))) / "config" /
               "settings.ini";
    }
#if defined(_WIN32)
    if (const char* appdata = std::getenv("APPDATA"); appdata && *appdata)
        return fs::path(appdata) / "bro" / "settings.ini";
    if (const char* userprofile = std::getenv("USERPROFILE"); userprofile && *userprofile)
        return fs::path(userprofile) / "AppData" / "Roaming" / "bro" / "settings.ini";
    return "settings.ini";
#elif defined(__APPLE__)
    if (const char* home = std::getenv("HOME"); home && *home)
        return fs::path(home) / "Library" / "Preferences" / "bro" / "settings.ini";
    return "settings.ini";
#else
    if (const char* xdg = std::getenv("XDG_CONFIG_HOME"); xdg && *xdg)
        return fs::path(xdg) / "bro" / "settings.ini";
    if (const char* home = std::getenv("HOME"); home && *home)
        return fs::path(home) / ".config" / "bro" / "settings.ini";
    return "settings.ini";
#endif
}

std::vector<fs::path> defaultSystemConfigPaths() {
    std::vector<fs::path> paths;
#if defined(_WIN32)
    if (const char* progdata = std::getenv("PROGRAMDATA"); progdata && *progdata)
        paths.push_back(fs::path(progdata) / "bro" / "settings.ini");
#elif defined(__APPLE__)
    paths.push_back("/Library/Preferences/bro/settings.ini");
#else
    if (const char* xdgDirs = std::getenv("XDG_CONFIG_DIRS"); xdgDirs && *xdgDirs) {
        std::string s(xdgDirs);
        size_t start = 0;
        while (start < s.size()) {
            size_t end = s.find(':', start);
            if (end == std::string::npos) end = s.size();
            std::string dir = s.substr(start, end - start);
            if (!dir.empty()) paths.push_back(fs::path(dir) / "bro" / "settings.ini");
            start = end + 1;
        }
    } else {
        paths.push_back("/etc/xdg/bro/settings.ini");
    }
    paths.push_back("/usr/share/bro/settings.ini");
#endif
    return paths;
}

class ConfIo {
public:
    using KeyRef = std::pair<std::string, std::string>;
    struct Pending {
        std::optional<std::string> raw;
        uint64_t seq = 0;
    };
    using PendingMap = std::map<KeyRef, Pending>;

    ConfIo() : userPath_(defaultUserConfigPath()), systemPaths_(defaultSystemConfigPaths()) {}

    void reopenForLoop() {
        std::lock_guard lk(mu_);
        stop_ = false;
        closed_ = false;
    }

    std::pair<std::string, std::vector<std::string>> loadInitial() {
        std::lock_guard lk(mu_);
        lastStamp_ = statFile(userPath_);
        std::string userText = readFileString(userPath_);
        std::vector<std::string> sysTexts;
        sysTexts.reserve(systemPaths_.size());
        for (const auto& sp : systemPaths_) sysTexts.push_back(readFileString(sp));
        return {std::move(userText), std::move(sysTexts)};
    }

    bool queuePatch(std::string section, std::string key, std::optional<std::string> raw) {
        bool open = false;
        {
            std::lock_guard lk(mu_);
            pending_[{std::move(section), std::move(key)}] = Pending{std::move(raw), ++seq_};
            open = !closed_;
            if (open && !writer_.joinable()) {
                writer_ = std::thread(&ConfIo::writerLoop, this);
            }
        }
        cv_.notify_all();
        if (!open) return flush();
        return true;
    }

    bool flush() {
        std::unique_lock lk(mu_);
        if (pending_.empty()) return true;
        if (seq_ <= attemptedSeq_) ++seq_;
        const uint64_t target = seq_;
        if (!writer_.joinable() || stop_) {
            PendingMap snapshot = pending_;
            lk.unlock();
            const bool ok = writeSnapshot(snapshot);
            lk.lock();
            attemptedSeq_ = std::max(attemptedSeq_, target);
            lastWriteOk_ = ok;
            if (ok) {
                eraseWrittenLocked(snapshot, target);
                ++writeEpoch_;
                lastStamp_ = statFile(userPath_);
            }
            return ok;
        }
        flushTarget_ = std::max(flushTarget_, target);
        cv_.notify_all();
        cv_.wait(lk, [&] { return attemptedSeq_ >= target; });
        return lastWriteOk_;
    }

    void close() {
        std::thread w;
        {
            std::lock_guard lk(mu_);
            if (closed_) return;
            closed_ = true;
            stop_ = true;
            w = std::move(writer_);
        }
        cv_.notify_all();
        if (w.joinable()) w.join();
        flush();
    }

    struct ExternalSnapshot {
        bool changed = false;
        std::string userText;
        std::vector<std::string> systemTexts;
        std::vector<std::pair<KeyRef, std::optional<std::string>>> pending;
    };

    ExternalSnapshot pollExternal() {
        ExternalSnapshot out;
        for (;;) {
            uint64_t epoch = 0;
            FileStamp known;
            {
                std::lock_guard lk(mu_);
                epoch = writeEpoch_;
                known = lastStamp_;
            }
            FileStamp cur = statFile(userPath_);
            if (cur == known) return out;

            std::string userText = readFileString(userPath_);
            std::vector<std::string> sysTexts;
            sysTexts.reserve(systemPaths_.size());
            for (const auto& sp : systemPaths_) sysTexts.push_back(readFileString(sp));

            std::lock_guard lk(mu_);
            if (writeEpoch_ != epoch) continue;
            lastStamp_ = cur;
            out.changed = true;
            out.userText = std::move(userText);
            out.systemTexts = std::move(sysTexts);
            out.pending.reserve(pending_.size());
            for (const auto& [ref, p] : pending_) out.pending.emplace_back(ref, p.raw);
            return out;
        }
    }

private:
    void eraseWrittenLocked(const PendingMap& snapshot, uint64_t upto) {
        for (const auto& [ref, p] : snapshot) {
            auto it = pending_.find(ref);
            if (it != pending_.end() && it->second.seq <= upto) pending_.erase(it);
        }
    }

    bool writeSnapshot(const PendingMap& snapshot) {
        IniSections disk = parseIni(readFileString(userPath_));
        for (const auto& [ref, p] : snapshot) {
            if (p.raw) {
                disk[ref.first][ref.second] = *p.raw;
            } else {
                auto sit = disk.find(ref.first);
                if (sit != disk.end()) {
                    sit->second.erase(ref.second);
                    if (sit->second.empty()) disk.erase(sit);
                }
            }
        }
        return writeFileAtomic(userPath_, serializeIni(disk));
    }

    void writerLoop() {
        std::unique_lock lk(mu_);
        for (;;) {
            cv_.wait(lk, [&] { return stop_ || seq_ > attemptedSeq_; });
            if (seq_ <= attemptedSeq_) {
                if (stop_) break;
                continue;
            }
            if (!stop_ && flushTarget_ <= attemptedSeq_) {
                cv_.wait_for(lk, std::chrono::milliseconds(50),
                             [&] { return stop_ || flushTarget_ > attemptedSeq_; });
            }
            PendingMap snapshot = pending_;
            const uint64_t upto = seq_;
            lk.unlock();
            const bool ok = writeSnapshot(snapshot);
            lk.lock();
            attemptedSeq_ = upto;
            lastWriteOk_ = ok;
            if (ok) {
                eraseWrittenLocked(snapshot, upto);
                ++writeEpoch_;
                lastStamp_ = statFile(userPath_);
            }
            cv_.notify_all();
        }
    }

    fs::path userPath_;
    std::vector<fs::path> systemPaths_;

    std::mutex mu_;
    std::condition_variable cv_;
    std::thread writer_;
    PendingMap pending_;
    uint64_t seq_ = 0;
    uint64_t attemptedSeq_ = 0;
    uint64_t flushTarget_ = 0;
    uint64_t writeEpoch_ = 0;
    FileStamp lastStamp_;
    bool stop_ = false;
    bool closed_ = false;
    bool lastWriteOk_ = true;
};

ConfIo& confIo() {
    static ConfIo* io = [] {
        auto* p = new ConfIo();
        std::atexit([] { confIo().close(); });
        return p;
    }();
    return *io;
}

std::unordered_map<uint64_t, ev::Persistent>& tickCallbacks() {
    static auto* m = new std::unordered_map<uint64_t, ev::Persistent>();
    return *m;
}

Value buildSysArray(const std::vector<std::string>& sysTexts) {
    return hostArrayOf(sysTexts.size(), [&sysTexts](size_t i) -> Value { return ev::fromUtf8(sysTexts[i]); });
}

Value hookCheckWriteError(Value, std::span<const Value> a) {
    if (a.empty() || !ev::isString(a[0])) return ev::null();
    const std::string subject = ev::toUtf8(a[0]);
    const std::string refused = ev::checkAccess(ev::AccessKind::DesktopWrite, subject);
    if (refused.empty()) return ev::null();
    return ev::newAccessError(refused, "EACCES");
}

Value hookLoadInitial(Value, std::span<const Value>) {
    auto [userText, sysTexts] = confIo().loadInitial();
    ObjectBuilder b;
    b.set("userText", ev::fromUtf8(userText));
    ev::Persistent sysArr(buildSysArray(sysTexts));
    b.set("systemTexts", sysArr.get());
    return b.get();
}

Value hookQueuePatch(Value, std::span<const Value> a) {
    if (a.size() < 3 || !ev::isString(a[0]) || !ev::isString(a[1])) return ev::fromBool(false);
    std::string section = ev::toUtf8(a[0]);
    std::string key = ev::toUtf8(a[1]);
    std::optional<std::string> raw;
    if (ev::isString(a[2])) raw = ev::toUtf8(a[2]);
    return ev::fromBool(confIo().queuePatch(std::move(section), std::move(key), std::move(raw)));
}

Value hookFlush(Value, std::span<const Value>) {
    return ev::fromBool(confIo().flush());
}

Value hookPollExternal(Value, std::span<const Value>) {
    auto snap = confIo().pollExternal();
    if (!snap.changed) return ev::null();
    ObjectBuilder b;
    b.set("userText", ev::fromUtf8(snap.userText));
    {
        ev::Persistent sysArr(buildSysArray(snap.systemTexts));
        b.set("systemTexts", sysArr.get());
    }
    {
        ev::Persistent pendArr(hostArrayOf(snap.pending.size(), [&snap](size_t i) -> Value {
            const auto& entry = snap.pending[i];
            ev::Persistent row(ev::makeArray(3));
            {
                ev::Persistent s(ev::fromUtf8(entry.first.first));
                row.set(ev::setElement(row.get(), 0, s.get()));
            }
            {
                ev::Persistent k(ev::fromUtf8(entry.first.second));
                row.set(ev::setElement(row.get(), 1, k.get()));
            }
            {
                ev::Persistent v(entry.second ? ev::fromUtf8(*entry.second) : ev::null());
                row.set(ev::setElement(row.get(), 2, v.get()));
            }
            return row.get();
        }));
        b.set("pending", pendArr.get());
    }
    return b.get();
}

Value hookOnTick(Value, std::span<const Value> a) {
    Value fn = argAt(a, 0);
    if (!ev::isFunction(fn)) return ev::throwTypeError("__bro_conf.onTick: expected a function");
    tickCallbacks()[currentCompartmentId()].set(fn);
    return ev::undefined();
}

void fireConfTicks() {
    auto& cbs = tickCallbacks();
    if (cbs.empty()) return;
    std::vector<std::pair<uint64_t, ev::Persistent>> ready;
    ready.reserve(cbs.size());
    for (auto& [id, fn] : cbs) {
        if (ev::isFunction(fn.get())) ready.emplace_back(id, ev::Persistent(fn.get()));
    }
    for (auto& [id, fn] : ready) {
        Compartment* c = compartmentById(id);
        if (!c || c->dying) continue;
        runEntry(c, EntryKind::Async, [fn = std::move(fn)] {
            ev::CallResult r = ev::call(fn.get(), ev::undefined(), {});
            if (r.thrown) reportBronzeError("__bro_conf.onTick", r.value);
        });
    }
}

}  // namespace

void installConfHooks(engine::Engine& engine) {
    confIo().reopenForLoop();
    ObjectBuilder b;
    b.def("checkWriteError", 1, hookCheckWriteError);
    b.def("loadInitial", 0, hookLoadInitial);
    b.def("queuePatch", 3, hookQueuePatch);
    b.def("flush", 0, hookFlush);
    b.def("pollExternal", 0, hookPollExternal);
    b.def("onTick", 1, hookOnTick);
    ev::registerGlobal("__bro_conf", b.get());

    static engine::Engine* s_installedEngine = nullptr;
    if (s_installedEngine != &engine) {
        s_installedEngine = &engine;
        engine.addFramePump([] {
            fireConfTicks();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] {
            confIo().close();
            tickCallbacks().clear();
        });
    }
}

void dropConfState(uint64_t compartmentId) {
    tickCallbacks().erase(compartmentId);
}

void shutdownConfForReload() {
    confIo().flush();
    tickCallbacks().clear();
}

}  // namespace helm::desktop
