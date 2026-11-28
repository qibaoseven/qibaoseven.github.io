// OpenStu 桌面端共用接口层（Qt6 Widgets / Windows 与 KDE 两个前端共用）
#pragma once
#include <QObject>
#include <QString>
#include <QUrl>
#include <QJsonObject>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QCryptographicHash>
#include <QStringList>

class OpenStuApi : public QObject {
    Q_OBJECT
public:
    explicit OpenStuApi(QObject* parent = nullptr);

    void setConfig(const QString& server, const QString& classId, const QString& password);
    QString server() const { return m_server; }
    QString classId() const { return m_classId; }
    bool hasConfig() const { return !m_classId.isEmpty() && !m_password.isEmpty(); }

    void fetchClasses();
    void fetchRequired(const QString& date = QString());      // 空 = 今天
    void fetchRoster();
    void fetchAllHomework();
    void submit(int studentId, int subjectId, int typeId, const QString& date = QString()); // typeId < 0 表示不分种类

    // ---- 班级数据（分数/金币/日志/分组）与初始化 ----
    void fetchClassData();
    void saveClassData(const QJsonObject& data);
    void fetchMeta();
    void initHomework(int studentCount, const QStringList& subjects);
    void fetchJournal(int studentId);
    void addJournal(int studentId, const QString& text);

signals:
    void classesReady(const QJsonArray& classes);
    void requiredReady(const QJsonObject& required);
    void rosterReady(const QJsonObject& roster);
    void homeworkReady(const QJsonObject& homework);
    void submitDone(const QJsonObject& result);
    void classDataReady(const QJsonObject& data);
    void classDataSaved(bool ok, const QString& message);
    void metaReady(const QJsonObject& meta);
    void journalReady(int studentId, const QString& text);
    void failed(const QString& message);

private:
    QNetworkRequest makeRequest(const QString& path, bool auth) const;
    void get(const QString& path, bool auth, const QString& tag);
    void post(const QString& path, const QJsonObject& body, bool auth, const QString& tag);
    QString passwordHash() const;

    QString m_server = "https://os-stu.netlify.app";
    QString m_classId;
    QString m_password;
    QNetworkAccessManager* m_net = nullptr;
};
