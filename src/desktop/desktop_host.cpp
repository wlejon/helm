#include "desktop/desktop_host.h"

#include "desktop/host_conf_hooks.h"
#include "engine/engine.h"
#include "util/log.h"
#include "util/main_loop_wake.h"

#include "embed/embed.h"

#include <broapps/api.h>
#include <broclip/api.h>
#include <brocred/api.h>
#include <brompris/api.h>
#include <broportal/api.h>
#include <bropulse/api.h>
#include <brosys/api.h>
#include <brothumb/api.h>
#include <brothumb/service.h>
#include <brovfs/api.h>

#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <string>

extern "C" void helm_conf_main();
extern "C" void helm_decor_main();
extern "C" void helm_keys_main();
extern "C" void helm_ime_main();

namespace helm::desktop {

namespace ev = bronze::embed;
using bronze::Value;

namespace {

void ensurePlainNs(ev::Persistent& bro, const char* name) {
    ev::Persistent ns(ev::createObject());
    bro.set(ev::setProperty(bro.get(), name, ns.get()));
}

void stampAvailable(ev::Persistent& bro, const char* name) {
    Value v = ev::getProperty(bro.get(), name);
    if (!ev::isObject(v)) return;
    ev::Persistent ns(v);
    if (ev::isUndefined(ev::getProperty(ns.get(), "available"))) {
        ev::setProperty(ns.get(), "available", ev::fromBool(true));
    }
}

void installThumbCacheDirIfIsolated() {
    static bool chosen = false;
    const char* appHome = std::getenv("BRO_APP_HOME");
    if (!chosen && appHome && *appHome) {
        brothumb::ThumbnailService::Config cfg;
        cfg.cache_dir = std::filesystem::absolute(
                            std::filesystem::path(std::u8string(appHome, appHome + std::strlen(appHome)))) /
                        "cache" / "thumbnails";
        std::string err;
        if (auto svc = brothumb::ThumbnailService::create(cfg, &err)) {
            brothumb::api::setService(std::move(svc));
        } else {
            LOG_WARN("bro.thumb: no service under BRO_APP_HOME (%s)", err.c_str());
        }
    }
    chosen = true;
}

}  // namespace

void installDesktopRootApis(bro::engine::Engine& engine) {
    ev::GlobalValue broG = ev::globalValue("bro");
    if (!broG.found || !ev::isObject(broG.value)) {
        LOG_ERROR("helm::desktop: bro global missing in installDesktopRootApis");
        return;
    }
    ev::Persistent bro(broG.value);
    for (const char* name : {"apps", "vfs", "conf", "decor", "keys", "ime"}) {
        ensurePlainNs(bro, name);
    }

    static bro::engine::Engine* s_hookedEngine = nullptr;
    const bool installHooks = (s_hookedEngine != &engine);
    if (installHooks) s_hookedEngine = &engine;

    broapps::api::installApps();
    if (installHooks) {
        engine.addFramePump([] {
            broapps::api::tickAppsAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { broapps::api::shutdownAppsAsync(); });
    }

    brovfs::api::installVfs();
    if (installHooks) {
        engine.addFramePump([] {
            brovfs::api::tickVfsAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { brovfs::api::shutdownVfsAsync(); });
    }

    installThumbCacheDirIfIsolated();
    brothumb::api::installThumb();
    if (installHooks) {
        brothumb::api::setWake(&bro::util::wakeMainLoop);
        engine.addFramePump([] {
            brothumb::api::tickThumbAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { brothumb::api::shutdownThumbAsync(); });
    }

    brocred::api::installCred();
    if (installHooks) {
        engine.addFramePump([] {
            brocred::api::tickCredAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { brocred::api::shutdownCredAsync(); });
    }

    brosys::api::installSys();
    if (installHooks) {
        engine.addFramePump([] {
            brosys::api::tickSysAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { brosys::api::shutdownSysAsync(); });
    }

    broportal::api::installPortal();
    if (installHooks) {
        engine.addFramePump([] {
            broportal::api::tickPortalAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { broportal::api::shutdownPortalAsync(); });
    }

    broclip::api::installClip();
    if (installHooks) {
        engine.addFramePump([] {
            broclip::api::tickClipAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { broclip::api::shutdownClipAsync(); });
    }

    brompris::api::setSessionAccess(engine.displayMode() != bro::engine::DisplayMode::Headless);
    brompris::api::installMpris();
    if (installHooks) {
        engine.addFramePump([] {
            brompris::api::tickMprisAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { brompris::api::shutdownMprisAsync(); });
    }

    bropulse::api::installPulse();
    if (installHooks) {
        engine.addFramePump([] {
            bropulse::api::tickPulseAsync();
            if (ev::microtasksPending()) ev::drainMicrotasks();
        });
        engine.addShutdownHook([] { bropulse::api::shutdownPulseAsync(); });
    }

    installConfHooks(engine);
    ev::runEntry(helm_conf_main);
    ev::runEntry(helm_decor_main);
    ev::runEntry(helm_keys_main);
    ev::runEntry(helm_ime_main);
}

void installDesktopWorkerApis() {
    ev::GlobalValue broG = ev::globalValue("bro");
    if (!broG.found || !ev::isObject(broG.value)) return;
    ev::Persistent bro(broG.value);
    for (const char* name : {"decor", "keys", "ime"}) {
        ensurePlainNs(bro, name);
    }
    ev::runEntry(helm_decor_main);
    ev::runEntry(helm_keys_main);
    ev::runEntry(helm_ime_main);
    for (const char* name : {"decor", "keys", "ime"}) {
        stampAvailable(bro, name);
    }
}

void dropDesktopCompartment(uint64_t compartmentId) {
    dropConfState(compartmentId);
}

void shutdownDesktopForReload() {
    shutdownConfForReload();
    broapps::api::shutdownAppsAsync();
    brovfs::api::shutdownVfsAsync();
    brothumb::api::shutdownThumbAsync();
    brocred::api::shutdownCredAsync();
    brosys::api::shutdownSysAsync();
    broportal::api::shutdownPortalAsync();
    broclip::api::shutdownClipAsync();
    brompris::api::shutdownMprisAsync();
    bropulse::api::shutdownPulseAsync();
}

void flushDesktopForExit() {
    shutdownConfForReload();
}

}  // namespace helm::desktop
