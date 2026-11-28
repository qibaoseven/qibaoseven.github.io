cmake_minimum_required(VERSION 3.16)
project(OpenStuDesktop LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets Network)

set(COMMON ${CMAKE_CURRENT_SOURCE_DIR}/../common-cpp)

add_executable(openstu-desktop WIN32
    src/main.cpp
    ${COMMON}/OpenStuApi.cpp
    ${COMMON}/OpenStuApi.h
    ${COMMON}/OpenStuWindow.cpp
    ${COMMON}/OpenStuWindow.h
)

target_include_directories(openstu-desktop PRIVATE ${COMMON})
target_link_libraries(openstu-desktop PRIVATE Qt6::Widgets Qt6::Network)

# Windows 下打包运行时依赖：cmake --build . --target deploy
if(WIN32)
    find_program(WINDEPLOYQT windeployqt HINTS "${Qt6_DIR}/../../../bin")
    if(WINDEPLOYQT)
        add_custom_target(deploy
            COMMAND "${WINDEPLOYQT}" "$<TARGET_FILE:openstu-desktop>" --no-translations
            DEPENDS openstu-desktop
            COMMENT "windeployqt：把 Qt 运行时 DLL 拷到 exe 旁边")
    endif()
endif()
