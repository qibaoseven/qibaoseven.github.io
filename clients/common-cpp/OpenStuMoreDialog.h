// 网页端「控制台 / 分数 / 金币 / 抽奖 / 日志 / 初始化 / 历程」的桌面版
#pragma once
#include <QDialog>
#include <QJsonObject>

class QPlainTextEdit;
class QDoubleSpinBox;

class OpenStuApi;
class QTabWidget;
class QTableWidget;
class QComboBox;
class QDoubleSpinBox;
class QLineEdit;
class QLabel;
class QPlainTextEdit;
class QSpinBox;

class OpenStuMoreDialog : public QDialog {
    Q_OBJECT
public:
    OpenStuMoreDialog(OpenStuApi* api, const QJsonObject& roster, QWidget* parent = nullptr);

private slots:
    void onData(const QJsonObject& data);
    void onSaved(bool ok, const QString& message);
    void onMeta(const QJsonObject& meta);
    void onJournal(int studentId, const QString& text);
    void onScoresClicked(int row, int column);
    void applyDelta(bool asGold);
    void draw(int times);
    void runInit();
    void readJournal();
    void appendJournal();
    void paySalaries();
    void runEvents();
    void addEvent();
    void groupCreate();
    void groupDelete();
    void groupAdd();
    void groupRemove();
    void reportMarkAll();
    void reportReset();
    void reportBatchApply();
    void examAdd();
    void drawPunishment();
    void completePunishment();
    void bindUid();
    void exchange(bool scoreToGold);
    void onUuids(const QJsonObject& uuids);
    void onUidAdded(bool ok, const QString& message);

private:
    void buildUi();
    void fillTable();
    void refreshGroupsView();
    void refreshReportView();
    void refreshExamView();
    void refreshPunView();
    QString sidOf(int row) const;
    QString nameOf(const QString& sid) const;

    OpenStuApi* m_api = nullptr;
    QJsonObject m_roster;
    QJsonObject m_data;

    QTabWidget* m_tabs = nullptr;
    // 分数 / 金币
    QTableWidget* m_table = nullptr;
    QComboBox* m_student = nullptr;
    QDoubleSpinBox* m_delta = nullptr;
    QLineEdit* m_reason = nullptr;
    QComboBox* m_studentsForGacha = nullptr;
    QLabel* m_msg = nullptr;
    // 分组
    QLineEdit* m_groupName = nullptr;
    QComboBox* m_groupMember = nullptr;
    QPlainTextEdit* m_groupView = nullptr;
    QLabel* m_groupMsg = nullptr;
    // 每日汇报
    QPlainTextEdit* m_reportView = nullptr;
    QDoubleSpinBox* m_reportDelta = nullptr;
    QLineEdit* m_reportReason = nullptr;
    QLabel* m_reportMsg = nullptr;
    // 考试
    QComboBox* m_examStudent = nullptr;
    QLineEdit* m_examSubject = nullptr;
    QDoubleSpinBox* m_examScore = nullptr;
    QDoubleSpinBox* m_examFull = nullptr;
    QPlainTextEdit* m_examView = nullptr;
    QLabel* m_examMsg = nullptr;
    // 惩罚
    QComboBox* m_punStudent = nullptr;
    QPlainTextEdit* m_punView = nullptr;
    QLabel* m_punMsg = nullptr;
    // 硬件登记
    QComboBox* m_uidStudent = nullptr;
    QLineEdit* m_uidHex = nullptr;
    QPlainTextEdit* m_uidView = nullptr;
    QLabel* m_uidMsg = nullptr;
    // 金币兑换
    QComboBox* m_exStudent = nullptr;
    QDoubleSpinBox* m_exAmount = nullptr;
    QLabel* m_exMsg = nullptr;
    // 日志
    QPlainTextEdit* m_logs = nullptr;
    // 初始化
    QSpinBox* m_count = nullptr;
    QLineEdit* m_subjects = nullptr;
    QPlainTextEdit* m_metaText = nullptr;
    // 历程
    QComboBox* m_journalStudent = nullptr;
    QPlainTextEdit* m_journalText = nullptr;
    QLineEdit* m_journalInput = nullptr;
    // 其它（职位/考试/汇报/备份/账号）
    QPlainTextEdit* m_extra = nullptr;
    // 自动事件
    QPlainTextEdit* m_events = nullptr;
    QLineEdit* m_evName = nullptr;
    QLineEdit* m_evFreq = nullptr;
    QLineEdit* m_evTargets = nullptr;
    QDoubleSpinBox* m_evChange = nullptr;
    QLineEdit* m_evReason = nullptr;
};
