// 共用主窗口：Windows(Qt) 与 Linux(KDE) 两个前端都直接用这个
#pragma once
#include <QWidget>
#include <QJsonObject>
#include <QVector>

class OpenStuApi;
class QLineEdit;
class QPushButton;
class QTableWidget;
class QProgressBar;
class QLabel;
class QPlainTextEdit;
class QComboBox;

class OpenStuWindow : public QWidget {
    Q_OBJECT
public:
    explicit OpenStuWindow(QWidget* parent = nullptr);

public slots:
    void refresh();                 // 重新拉今日应交 + 名册
    void loadSettings();            // 从 QSettings 读服务器/班级/密码

private slots:
    void onSaveSettings();
    void onConnect();
    void onClassesReady(const QJsonArray& classes);
    void onRequiredReady(const QJsonObject& required);
    void onRosterReady(const QJsonObject& roster);
    void onSubmitDone(const QJsonObject& result);
    void onFailed(const QString& msg);
    void onCellClicked(int row, int column);

private:
    void buildUi();
    void log(const QString& s);
    void fillTable();
    QStringList subjectNames() const;
    QVector<int> requiredSubjects() const;

    OpenStuApi* m_api = nullptr;
    QLineEdit* m_server = nullptr;
    QLineEdit* m_classId = nullptr;
    QLineEdit* m_password = nullptr;
    QPushButton* m_save = nullptr;
    QPushButton* m_connect = nullptr;
    QPushButton* m_refresh = nullptr;
    QTableWidget* m_table = nullptr;
    QProgressBar* m_progress = nullptr;
    QLabel* m_status = nullptr;
    QPlainTextEdit* m_log = nullptr;
    QComboBox* m_date = nullptr;

    QJsonObject m_required;   // 最近一次 /homework/required
    QJsonObject m_roster;     // 最近一次 /students
    QJsonObject m_homework;   // 最近一次 /homework（判已交）
};
