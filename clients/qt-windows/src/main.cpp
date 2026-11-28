// Windows 原生前端（Qt6 Widgets 单文件可执行）
#include <QApplication>
#include <QFont>
#include "OpenStuWindow.h"

int main(int argc, char** argv) {
    QApplication app(argc, argv);
    app.setApplicationName("OpenStu");
    app.setOrganizationName("qibaoseven");
    app.setApplicationDisplayName("OpenStu · 交作业登记");

    // 中文界面默认字体（Windows 上是微软雅黑，其它平台自动回退）
    QFont f = app.font();
    f.setPointSize(10);
    app.setFont(f);

    OpenStuWindow w;
    w.show();
    return app.exec();
}
