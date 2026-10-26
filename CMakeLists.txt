cmake_minimum_required(VERSION 3.24)

# Apple Silicon architecture handling
if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Darwin")
    execute_process(COMMAND sysctl -n hw.optional.arm64
        OUTPUT_VARIABLE _helm_arm64 OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
    if(_helm_arm64 STREQUAL "1")
        if(NOT CMAKE_OSX_ARCHITECTURES)
            set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "")
        endif()
        if(NOT VCPKG_TARGET_TRIPLET)
            set(VCPKG_TARGET_TRIPLET "arm64-osx" CACHE STRING "")
        endif()
    endif()
endif()

# vcpkg toolchain detection
if(NOT DEFINED CMAKE_TOOLCHAIN_FILE)
    if(DEFINED ENV{VCPKG_ROOT})
        set(_helm_vcpkg "$ENV{VCPKG_ROOT}")
    else()
        foreach(_c "$ENV{HOME}/vcpkg" "${CMAKE_CURRENT_SOURCE_DIR}/../vcpkg" "D:/vcpkg" "C:/vcpkg"
                   "/opt/vcpkg" "/usr/local/vcpkg")
            if(EXISTS "${_c}/scripts/buildsystems/vcpkg.cmake")
                set(_helm_vcpkg "${_c}")
                break()
            endif()
        endforeach()
    endif()
    if(DEFINED _helm_vcpkg)
        message(STATUS "helm: vcpkg toolchain from ${_helm_vcpkg}")
        set(CMAKE_TOOLCHAIN_FILE "${_helm_vcpkg}/scripts/buildsystems/vcpkg.cmake" CACHE STRING "")
    endif()
endif()

project(helm VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ---- bro engine resolution ---------------------------------------------------
# A bro_dependency (cmake/bro_deps.cmake): the ../bro working tree beside this
# repo, else the head of bro's main (a release tag: the commit
# cmake/bro_lock.cmake locks), fetched at configure;
# -DFETCHCONTENT_SOURCE_DIR_BRO=<path> picks another tree. bro declares every
# library it builds itself, so helm declares only bro.
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/bro_deps.cmake)

# Feature profile: desktop
set(BRO_PROFILE "desktop" CACHE STRING "bro feature profile")
set(BRO_WITH_COMPOSITOR ON CACHE BOOL "Window compositor")
set(BRO_WITH_SYS ON CACHE BOOL "System services")
set(BRO_WITH_DISPLAYS ON CACHE BOOL "Display configuration")
set(BRO_WITH_APPS ON CACHE BOOL "App catalog and launcher")
set(BRO_WITH_CRED ON CACHE BOOL "Credentials and verification")
set(BRO_WITH_SEARCH ON CACHE BOOL "Fuzzy search")
set(BRO_WITH_KEYS ON CACHE BOOL "Keybindings")
set(BRO_WITH_THEMES ON CACHE BOOL "Themes")
set(BRO_WITH_CONF ON CACHE BOOL "Config store")
set(BRO_WITH_SEAT ON CACHE BOOL "Session seat")
set(BRO_WITH_DECOR ON CACHE BOOL "Window decorations")
set(BRO_WITH_CLIP ON CACHE BOOL "Clipboard history")
set(BRO_WITH_MPRIS ON CACHE BOOL "Media player integration")
set(BRO_WITH_PULSE ON CACHE BOOL "PipeWire audio policy")
set(BRO_WITH_IME ON CACHE BOOL "Input method engine")
set(BRO_WITH_PORTAL ON CACHE BOOL "Desktop portal backend (broportal)")
# bro.remote: `helm --remote` hosts the screen for remote viewers (bro builds
# broremote like its other dependencies).
set(BRO_WITH_REMOTE ON CACHE BOOL "Remote session hosting (broremote)")

# How helm links the engine (bro BUILDING.md, "The engine library"):
#
#   * Linux and macOS: libbro, the engine as one shared library, so helm and
#     every app it launches map one copy of the engine's code. With
#     -Dbro_DIR=<a bro build tree> helm links THAT tree's libbro: the one the
#     installed apps run on (their executables load it), which is what makes
#     the sharing real. halo's live build is configured that way, against
#     ~/projects/bro/build-release. Without it, bro is built here as a
#     subproject and helm links that libbro.
#   * Windows: libbro.dll exports only bro's C entry points, so helm links the
#     engine's static libraries, as before.
#   * -DHELM_STATIC_ENGINE=ON links the static libraries everywhere (a
#     subproject build): one self-contained helm, and the baseline to compare
#     the shared engine against.
option(HELM_STATIC_ENGINE "Link the engine's static libraries instead of libbro" OFF)
set(_helm_engine_features COMPOSITOR SYS DISPLAYS APPS CRED SEARCH KEYS THEMES CONF SEAT DECOR CLIP MPRIS
    PULSE IME PORTAL REMOTE)
if(NOT WIN32 AND bro_DIR AND NOT HELM_STATIC_ENGINE)
    find_package(bro CONFIG REQUIRED)
    foreach(_f IN LISTS _helm_engine_features)
        if(NOT BRO_WITH_${_f})
            message(FATAL_ERROR "helm: the bro build at ${BRO_BINARY_DIR} has BRO_WITH_${_f} off; helm needs it")
        endif()
    endforeach()
    message(STATUS "helm: linking libbro of the bro build at ${BRO_BINARY_DIR}")
    set(BRO_DIR "${BRO_SOURCE_DIR}")
    set(HELM_ENGINE bro::libbro)
    set(HELM_PREBUILT_BRO ON)
else()
    bro_dependency(bro GITHUB wlejon/bro TARGET bro_engine)
    set(BRO_DIR "${bro_SOURCE_DIR}")
    if(WIN32 OR HELM_STATIC_ENGINE)
        set(HELM_ENGINE bro_engine bro_bronze_host bro_bronze_js bronze::runtime_shared)
    else()
        set(HELM_ENGINE bro::libbro)
    endif()
    set(HELM_PREBUILT_BRO OFF)
endif()

# ---- helm sources & executables ----------------------------------------------
set(HELM_COMMON_SOURCES
    src/paths.cpp
)

# Windowed desktop application executable
add_executable(helm WIN32
    src/main.cpp
    ${HELM_COMMON_SOURCES}
)
target_include_directories(helm PRIVATE "${BRO_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_compile_definitions(helm PRIVATE HELM_VERSION="${PROJECT_VERSION}")
target_link_libraries(helm PRIVATE ${HELM_ENGINE})

# Headless desktop application test driver executable
add_executable(helm-headless
    src/headless_main.cpp
    ${HELM_COMMON_SOURCES}
)
target_include_directories(helm-headless PRIVATE "${BRO_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_compile_definitions(helm-headless PRIVATE HELM_VERSION="${PROJECT_VERSION}")
target_link_libraries(helm-headless PRIVATE ${HELM_ENGINE})
if(NOT HELM_PREBUILT_BRO)
    # bronze's runtime (and libbro) staged beside the executables, found
    # through $ORIGIN. A prebuilt bro's libraries are found where they are:
    # their absolute directory is in the build tree's rpath.
    bro_bronze_stage_runtime(helm)
    bro_bronze_stage_runtime(helm-headless)
endif()

if(MSVC)
    target_link_options(helm PRIVATE /STACK:33554432 /ENTRY:mainCRTStartup)
    target_link_options(helm-headless PRIVATE /STACK:33554432)
endif()
if(WIN32)
    target_link_libraries(helm PRIVATE ws2_32 advapi32 shell32 ole32)
    target_link_libraries(helm-headless PRIVATE ws2_32 advapi32 shell32 ole32)
endif()

# Stage ui/ beside the executables in build tree
add_custom_target(helm_stage_ui ALL
    COMMAND "${CMAKE_COMMAND}" -E copy_directory
        "${CMAKE_CURRENT_SOURCE_DIR}/ui"
        "$<TARGET_FILE_DIR:helm>/ui"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory
        "${CMAKE_CURRENT_SOURCE_DIR}/ui"
        "$<TARGET_FILE_DIR:helm>/system/helm"
    COMMENT "Staging ui/ beside helm executable"
)
add_dependencies(helm helm_stage_ui)
add_dependencies(helm-headless helm_stage_ui)

# ---- Installation -------------------------------------------------------------
include(GNUInstallDirs)
install(TARGETS helm RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
# system/ beside the executable is where bro trusts a shell app to live.
install(DIRECTORY ui/ DESTINATION ${CMAKE_INSTALL_BINDIR}/system/helm)
if(NOT HELM_PREBUILT_BRO)
    install(FILES $<TARGET_FILE:bronze_runtime_shared> DESTINATION ${CMAKE_INSTALL_BINDIR})
    if(NOT WIN32 AND NOT HELM_STATIC_ENGINE)
        install(FILES $<TARGET_FILE:libbro> DESTINATION ${CMAKE_INSTALL_BINDIR})
    endif()
endif()

# ---- Tests --------------------------------------------------------------------
enable_testing()
# Tests that need real Wayland clients (test_frames.js) spawn brocompositor's
# test client from here; they skip when it is absent.
set(BC_TEST_CLIENT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../brocompositor/build-release/tests"
    CACHE PATH "Directory holding brocompositor's bc_wl_client test client")
# test_permissions.js changes the grant store from other processes with bro's
# own executables from bro's build beside helm (`bro --revoke-app`,
# `--dev-mode`, a fake app picking files in bro-headless); it skips without them.
set(_bro_cli "")
foreach(_c "${BRO_DIR}/build/Release/bro.exe" "${BRO_DIR}/build-release/bro" "${BRO_DIR}/build/bro")
    if(NOT _bro_cli AND EXISTS "${_c}")
        set(_bro_cli "${_c}")
    endif()
endforeach()
set(HELM_BRO_CLI "${_bro_cli}" CACHE FILEPATH "bro executable test_permissions.js runs for its outside changes")
file(GLOB _helm_tests CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_*.js")
# Each test's config and home live in the temp directory, not the build tree:
# a single-config build puts helm-headless in the build directory itself, and
# the folder bro runs from is bro's own, which no app writes (docs/apps.md,
# Permissions), so a home under it could not be written.
if(DEFINED ENV{TMPDIR})
    set(_helm_tmp "$ENV{TMPDIR}")
elseif(WIN32 AND DEFINED ENV{TEMP})
    set(_helm_tmp "$ENV{TEMP}")
else()
    set(_helm_tmp "/tmp")
endif()
file(TO_CMAKE_PATH "${_helm_tmp}" _helm_tmp)
string(MD5 _helm_build_hash "${CMAKE_CURRENT_BINARY_DIR}")
string(SUBSTRING "${_helm_build_hash}" 0 10 _helm_build_hash)
set(_helm_cfg_root "${_helm_tmp}/helm-test-config-${_helm_build_hash}")
foreach(_t IN LISTS _helm_tests)
    get_filename_component(_name "${_t}" NAME_WE)
    string(REGEX REPLACE "^test_" "" _name "${_name}")
    set(_cfg "${_helm_cfg_root}/${_name}")
    add_test(NAME clean-${_name} COMMAND "${CMAKE_COMMAND}" -E rm -rf "${_cfg}")
    set_tests_properties(clean-${_name} PROPERTIES FIXTURES_SETUP cfg-${_name})
    add_test(NAME ui-${_name}
             COMMAND helm-headless --width 1920 --height 1080
                     "${CMAKE_CURRENT_SOURCE_DIR}/ui" "${_t}")
    # bro.conf is under XDG_CONFIG_HOME on Linux and %APPDATA% on Windows;
    # BRO_APP_HOME isolates it everywhere. Set all three.
    set(_env "HELM_CONFIG_DIR=${_cfg};XDG_CONFIG_HOME=${_cfg}/xdg;APPDATA=${_cfg}/appdata;BRO_APP_HOME=${_cfg}/home;HELM_TEST=1")
    if(_name STREQUAL "frames")
        # The DRM shell host's compositor and input router, headless.
        list(APPEND _env "BRO_HEADLESS_COMPOSITOR=1" "BC_TEST_CLIENT_DIR=${BC_TEST_CLIENT_DIR}")
    elseif(_name STREQUAL "permissions" AND HELM_BRO_CLI)
        list(APPEND _env "BRO_CLI=${HELM_BRO_CLI}")
    endif()
    set_tests_properties(ui-${_name} PROPERTIES
        ENVIRONMENT "${_env}"
        FIXTURES_REQUIRED cfg-${_name}
        SKIP_RETURN_CODE 77
        TIMEOUT 180)
endforeach()

if(TARGET bronze)
    add_test(NAME bronze-check
             COMMAND $<TARGET_FILE:bronze> check "${CMAKE_CURRENT_SOURCE_DIR}/ui/js/shell.js")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../bronze/build/src/cli/bronze")
    add_test(NAME bronze-check
             COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/../bronze/build/src/cli/bronze" check
                     "${CMAKE_CURRENT_SOURCE_DIR}/ui/js/shell.js")
endif()
