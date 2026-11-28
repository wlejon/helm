# Desktop host layer and Bronze JS desktop modules owned by helm.

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    find_package(PkgConfig QUIET)
    if(PKG_CONFIG_FOUND)
        pkg_check_modules(_helm_libsystemd QUIET libsystemd)
        if(_helm_libsystemd_FOUND)
            bro_dependency(brodbus OPTIONS BRODBUS_BUILD_TESTS=OFF)
        endif()
    endif()
endif()

set(BROAPPS_ENABLE_API   ON CACHE BOOL "" FORCE)
set(BROVFS_ENABLE_API    ON CACHE BOOL "" FORCE)
set(BROTHUMB_ENABLE_API  ON CACHE BOOL "" FORCE)
set(BROCRED_ENABLE_API   ON CACHE BOOL "" FORCE)
set(BROSYS_ENABLE_API    ON CACHE BOOL "" FORCE)
set(BROPORTAL_ENABLE_API ON CACHE BOOL "" FORCE)
set(BROCLIP_ENABLE_API   ON CACHE BOOL "" FORCE)
set(BROMPRIS_ENABLE_API  ON CACHE BOOL "" FORCE)
set(BROPULSE_ENABLE_API  ON CACHE BOOL "" FORCE)

set(BROVFS_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(BROAPPS_BUILD_TESTS   OFF CACHE BOOL "" FORCE)
set(BROTHUMB_BUILD_TESTS  OFF CACHE BOOL "" FORCE)
set(BROCRED_BUILD_TESTS   OFF CACHE BOOL "" FORCE)
set(BROSYS_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(BROPORTAL_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(BROCLIP_BUILD_TESTS   OFF CACHE BOOL "" FORCE)
set(BROMPRIS_BUILD_TESTS  OFF CACHE BOOL "" FORCE)
set(BROPULSE_BUILD_TESTS  OFF CACHE BOOL "" FORCE)

set(_helm_libs_dir "${CMAKE_SOURCE_DIR}/libs")
foreach(_lib IN ITEMS brovfs broapps brothumb brocred brosys broportal broclip brompris bropulse)
    add_subdirectory("${_helm_libs_dir}/${_lib}" "${CMAKE_CURRENT_BINARY_DIR}/libs/${_lib}" EXCLUDE_FROM_ALL)
endforeach()
if(WIN32 AND TARGET brocred AND EXISTS "${CMAKE_BINARY_DIR}/cppwinrt")
    target_include_directories(brocred PRIVATE "${CMAKE_BINARY_DIR}/cppwinrt")
endif()

set(_helm_brass_backend OFF)
if(BRASS_HOST_BACKEND OR BRO_BRASS_HOST_BACKEND)
    set(_helm_brass_backend ON)
endif()

if(_helm_brass_backend AND TARGET bronze)
    set(HELM_JS_GEN_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
    file(MAKE_DIRECTORY "${HELM_JS_GEN_DIR}")
    set(HELM_JS_MODULE_GLOBALS "${CMAKE_CURRENT_SOURCE_DIR}/js/module.globals")
    set(HELM_COMPILED_JS_OBJECTS "")

    function(helm_compile_desktop_js JS_FILE ENTRY_SYMBOL)
        set(INPUT  "${CMAKE_CURRENT_SOURCE_DIR}/js/${JS_FILE}.js")
        set(OUTPUT "${HELM_JS_GEN_DIR}/${JS_FILE}.o")
        add_custom_command(
            OUTPUT  "${OUTPUT}"
            COMMAND $<TARGET_FILE:bronze> build "${INPUT}" --emit-obj
                    --host-globals "${HELM_JS_MODULE_GLOBALS}"
                    --entry-symbol=${ENTRY_SYMBOL} -o "${OUTPUT}"
            DEPENDS bronze "${INPUT}" "${HELM_JS_MODULE_GLOBALS}"
            COMMENT "bronze compile src/desktop/js/${JS_FILE}.js -> ${JS_FILE}.o (${ENTRY_SYMBOL})"
            VERBATIM
        )
        set_source_files_properties("${OUTPUT}" PROPERTIES EXTERNAL_OBJECT TRUE GENERATED TRUE)
        list(APPEND HELM_COMPILED_JS_OBJECTS "${OUTPUT}")
        set(HELM_COMPILED_JS_OBJECTS "${HELM_COMPILED_JS_OBJECTS}" PARENT_SCOPE)
    endfunction()

    helm_compile_desktop_js(conf  helm_conf_main)
    helm_compile_desktop_js(decor helm_decor_main)
    helm_compile_desktop_js(keys  helm_keys_main)
    helm_compile_desktop_js(ime   helm_ime_main)

    add_library(helm_bronze_js STATIC ${HELM_COMPILED_JS_OBJECTS})
    set_target_properties(helm_bronze_js PROPERTIES LINKER_LANGUAGE CXX)
    target_link_libraries(helm_bronze_js INTERFACE bronze::runtime_shared)
else()
    add_library(helm_bronze_js STATIC js_entry_stubs.cpp)
endif()

add_library(helm_desktop STATIC
    desktop_host.cpp
    host_conf_hooks.cpp
)
target_include_directories(helm_desktop PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/.."
    "${BRO_DIR}/src"
)
target_link_libraries(helm_desktop
    PUBLIC
        ${HELM_ENGINE}
    PRIVATE
        broapps broapps_api
        brovfs brovfs_api
        brothumb brothumb_api
        brocred brocred_api
        brosys brosys_api
        broportal broportal_api
        broclip broclip_api
        brompris brompris_api
        bropulse bropulse_api
        helm_bronze_js
)
