cmake_minimum_required(VERSION 3.16)
project(OpenStuKDE LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

option(OPENSTU_WITH_KDE "链接 KDE Frameworks（KXmlGui），没有就纯 Qt" ON)

find_package(Qt6 REQUIRED COMPONENTS Widgets Network)
set(COMMON ${CMAKE_CURRENT_SOURCE_DIR}/../common-cpp)

add_executable(openstu-kde
    src/main.cpp
    ${COMMON}/OpenStuApi.cpp
    ${COMMON}/OpenStuApi.h
    ${COMMON}/OpenStuWindow.cpp
    ${COMMON}/OpenStuWindow.h
)
target_include_directories(openstu-kde PRIVATE ${COMMON})
target_link_libraries(openstu-kde PRIVATE Qt6::Widgets Qt6::Network)

if(OPENSTU_WITH_KDE)
    find_package(KF6XmlGui QUIET)
    if(KF6XmlGui_FOUND)
        target_compile_definitions(openstu-kde PRIVATE OPENSTU_KDE)
        target_link_libraries(openstu-kde PRIVATE KF6::XmlGui KF6::CoreAddons)
        message(STATUS "启用 KDE 外壳（KXmlGui）")
    else()
        message(STATUS "未找到 KF6XmlGui，降级为纯 Qt 界面")
    endif()
endif()

install(TARGETS openstu-kde RUNTIME DESTINATION bin)
