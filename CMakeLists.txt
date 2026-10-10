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
# bro.remote: `helm --remote` hosts the screen for remote viewers (bro builds
# broremote like its other dependencies).
set(BRO_WITH_REMOTE ON CACHE BOOL "Remote session hosting (broremote)")

bro_dependency(bro GITHUB wlejon/bro TARGET bro_engine)
set(BRO_DIR "${bro_SOURCE_DIR}")

# ---- helm sources & executables ----------------------------------------------
set(HELM_COMMON_SOURCES
    src/paths.cpp
)
if(WIN32)
    list(APPEND HELM_COMMON_SOURCES src/win_shell_broker.cpp)
endif()

# Windowed desktop application executable
add_executable(helm WIN32
    src/main.cpp
    ${HELM_COMMON_SOURCES}
)
target_include_directories(helm PRIVATE "${BRO_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_compile_definitions(helm PRIVATE HELM_VERSION="${PROJECT_VERSION}")
target_link_libraries(helm PRIVATE bro_engine bro_bronze_host bro_bronze_js bronze::runtime_shared)
if(WIN32)
    target_link_libraries(helm PRIVATE comctl32)
endif()
bro_bronze_stage_runtime(helm)

# Headless desktop application test driver executable
add_executable(helm-headless
    src/headless_main.cpp
    ${HELM_COMMON_SOURCES}
)
target_include_directories(helm-headless PRIVATE "${BRO_DIR}/src" "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_compile_definitions(helm-headless PRIVATE HELM_VERSION="${PROJECT_VERSION}")
target_link_libraries(helm-headless PRIVATE bro_engine bro_bronze_host bro_bronze_js bronze::runtime_shared)
bro_bronze_stage_runtime(helm-headless)

if(MSVC)
    target_link_options(helm PRIVATE /STACK:33554432 /ENTRY:mainCRTStartup)
    target_link_options(helm-headless PRIVATE /STACK:33554432)
endif()
if(WIN32)
    target_link_libraries(helm PRIVATE ws2_32 advapi32 shell32 ole32 comctl32)
    target_link_libraries(helm-headless PRIVATE ws2_32 advapi32 shell32 ole32 comctl32)
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
install(FILES $<TARGET_FILE:bronze_runtime_shared> DESTINATION ${CMAKE_INSTALL_BINDIR})

# ---- Tests --------------------------------------------------------------------
enable_testing()
# Tests that need real Wayland clients (test_frames.js) spawn brocompositor's
# test client from here; they skip when it is absent.
set(BC_TEST_CLIENT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../brocompositor/build-release/tests"
    CACHE PATH "Directory holding brocompositor's bc_wl_client test client")
file(GLOB _helm_tests CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_*.js")
foreach(_t IN LISTS _helm_tests)
    get_filename_component(_name "${_t}" NAME_WE)
    string(REGEX REPLACE "^test_" "" _name "${_name}")
    set(_cfg "${CMAKE_CURRENT_BINARY_DIR}/test-config/${_name}")
    add_test(NAME clean-${_name} COMMAND "${CMAKE_COMMAND}" -E rm -rf "${_cfg}")
    set_tests_properties(clean-${_name} PROPERTIES FIXTURES_SETUP cfg-${_name})
    add_test(NAME ui-${_name}
             COMMAND helm-headless --width 1920 --height 1080
                     "${CMAKE_CURRENT_SOURCE_DIR}/ui" "${_t}")
    # bro.conf is under XDG_CONFIG_HOME on Linux and %APPDATA% on Windows;
    # BRO_APP_HOME isolates it everywhere. Set all three.
    set(_env "BRO_TRUSTED_APP_DIR=${CMAKE_CURRENT_SOURCE_DIR}/ui;HELM_CONFIG_DIR=${_cfg};XDG_CONFIG_HOME=${_cfg}/xdg;APPDATA=${_cfg}/appdata;BRO_APP_HOME=${_cfg}/home;HELM_TEST=1")
    if(_name STREQUAL "frames")
        # The DRM shell host's compositor and input router, headless.
        list(APPEND _env "BRO_HEADLESS_COMPOSITOR=1" "BC_TEST_CLIENT_DIR=${BC_TEST_CLIENT_DIR}")
    endif()
    set_tests_properties(ui-${_name} PROPERTIES
        ENVIRONMENT "${_env}"
        FIXTURES_REQUIRED cfg-${_name}
        SKIP_RETURN_CODE 77
        TIMEOUT 180)
endforeach()
