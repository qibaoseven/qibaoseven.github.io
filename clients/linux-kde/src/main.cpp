// Linux KDE 前端：KXmlGuiWindow 外壳 + 共用 OpenStuWindow 作为中央控件
// 没有装 KDE Frameworks 时会自动降级为纯 Qt 版（宏 OPENSTU_KDE 控制）
#include <QApplication>
#include "OpenStuWindow.h"

#ifdef OPENSTU_KDE
#include <KAboutData>
#include <KLocalizedString>
#include <KXmlGuiWindow>
#include <KStandardAction>
#include <KActionCollection>
#include <QAction>
#include <QIcon>

class KdeShell : public KXmlGuiWindow {
public:
    KdeShell() {
        auto* view = new OpenStuWindow(this);
        setCentralWidget(view);
        setWindowTitle(i18n("OpenStu · 交作业登记"));
        setWindowIcon(QIcon::fromTheme("view-refresh"));

        auto* refresh = KStandardAction::redisplay(view, &OpenStuWindow::refresh, actionCollection());
        refresh->setText(i18n("刷新"));
        KStandardAction::quit(qApp, &QApplication::quit, actionCollection());
        setupGUI(Default, "openstu-kde.rc");
    }
};
#endif

int main(int argc, char** argv) {
    QApplication app(argc, argv);
    app.setApplicationName("openstu-kde");
    app.setOrganizationName("qibaoseven");

#ifdef OPENSTU_KDE
    KAboutData about(QStringLiteral("openstu-kde"), i18n("OpenStu"),
                     QStringLiteral("0.46"),
                     i18n("班级交作业登记客户端"),
                     KAboutLicense::GPL_V3,
                     i18n("© 2026 qibaoseven"));
    KAboutData::setApplicationData(about);
    KdeShell w;
#else
    OpenStuWindow w;
    w.setWindowTitle("OpenStu · 交作业登记");
#endif
    w.show();
    return app.exec();
}
