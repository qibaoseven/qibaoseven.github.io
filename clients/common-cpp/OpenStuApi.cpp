#include "OpenStuApi.h"
#include <QJsonDocument>
#include <QDate>

OpenStuApi::OpenStuApi(QObject* parent) : QObject(parent) {
    m_net = new QNetworkAccessManager(this);
}

void OpenStuApi::setConfig(const QString& server, const QString& classId, const QString& password) {
    m_server = server.trimmed();
    while (m_server.endsWith('/')) m_server.chop(1);
    m_classId = classId.trimmed();
    m_password = password;
}

QString OpenStuApi::passwordHash() const {
    return QString::fromLatin1(
        QCryptographicHash::hash(m_password.toUtf8(), QCryptographicHash::Sha256).toHex());
}

QNetworkRequest OpenStuApi::makeRequest(const QString& path, bool auth) const {
    QNetworkRequest req(QUrl(m_server + path));
    req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    req.setRawHeader("Accept", "application/json");
    if (auth) {
        req.setRawHeader("X-Password", m_password.toUtf8());
        req.setRawHeader("X-Password-Hash", passwordHash().toLatin1());
    }
    return req;
}

static QString describeError(QNetworkReply* reply) {
    const int code = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    QString msg = QString("HTTP %1").arg(code);
    QJsonObject o = QJsonDocument::fromJson(reply->readAll()).object();
    if (!o.isEmpty()) {
        if (!o.value("error").toString().isEmpty()) msg += " · " + o.value("error").toString();
        if (!o.value("code").toString().isEmpty())  msg += " (" + o.value("code").toString() + ")";
        if (o.value("required").isArray()) {
            msg += " · 今日应交:";
            for (const auto& v : o.value("required").toArray()) msg += " " + QString::number(v.toInt());
        }
    }
    return msg;
}

void OpenStuApi::get(const QString& path, bool auth, const QString& tag) {
    QNetworkReply* reply = m_net->get(makeRequest(path, auth));
    connect(reply, &QNetworkReply::finished, this, [this, reply, tag]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit failed(describeError(reply));
            return;
        }
        QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        if (tag == "classes")  emit classesReady(doc.array());
        else if (tag == "required") emit requiredReady(doc.object());
        else if (tag == "roster")   emit rosterReady(doc.object());
        else if (tag == "homework") emit homeworkReady(doc.object());
    });
}

void OpenStuApi::post(const QString& path, const QJsonObject& body, bool auth, const QString& tag) {
    QNetworkReply* reply = m_net->post(makeRequest(path, auth), QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply, tag]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit failed(describeError(reply));
            return;
        }
        QJsonObject o = QJsonDocument::fromJson(reply->readAll()).object();
        if (tag == "submit") emit submitDone(o);
    });
}

void OpenStuApi::fetchClassData() {
    QNetworkReply* reply = m_net->get(makeRequest("/api/class/" + m_classId, true));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) { emit failed(describeError(reply)); return; }
        const QJsonObject o = QJsonDocument::fromJson(reply->readAll()).object();
        emit classDataReady(o.value("data").toObject());
    });
}

void OpenStuApi::saveClassData(const QJsonObject& data) {
    const QJsonObject body{ {"data", data} };
    QNetworkReply* reply = m_net->post(makeRequest("/api/class/" + m_classId, true),
                                       QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit classDataSaved(false, describeError(reply));
            return;
        }
        emit classDataSaved(true, QStringLiteral("已保存"));
    });
}

void OpenStuApi::fetchMeta() {
    QNetworkReply* reply = m_net->get(makeRequest("/api/class/" + m_classId + "/homework/meta", true));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) { emit failed(describeError(reply)); return; }
        emit metaReady(QJsonDocument::fromJson(reply->readAll()).object());
    });
}

void OpenStuApi::initHomework(int studentCount, const QStringList& subjects) {
    QJsonObject names;
    for (int i = 0; i < subjects.size(); ++i) names[QString::number(i)] = subjects.at(i);
    const QJsonObject body{
        {"student_count", studentCount},
        {"subject_count", subjects.size()},
        {"subject_names", names}
    };
    QNetworkReply* reply = m_net->post(makeRequest("/api/class/" + m_classId + "/homework/init", true),
                                       QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit classDataSaved(false, describeError(reply));
            return;
        }
        emit classDataSaved(true, QStringLiteral("初始化完成"));
    });
}

void OpenStuApi::fetchJournal(int studentId) {
    QNetworkReply* reply = m_net->get(makeRequest(
        "/api/class/" + m_classId + "/journal/" + QString::number(studentId), true));
    connect(reply, &QNetworkReply::finished, this, [this, reply, studentId]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) { emit failed(describeError(reply)); return; }
        const QJsonObject o = QJsonDocument::fromJson(reply->readAll()).object();
        emit journalReady(studentId, o.value("journal").toString());
    });
}

void OpenStuApi::addJournal(int studentId, const QString& text) {
    const QJsonObject body{
        {"student_id", QString::number(studentId)},
        {"content", text}
    };
    QNetworkReply* reply = m_net->post(makeRequest("/api/class/" + m_classId + "/journal", true),
                                       QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply, studentId]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) { emit failed(describeError(reply)); return; }
        emit classDataSaved(true, QStringLiteral("历程已追加"));
    });
}

void OpenStuApi::fetchClasses() {
    get("/api/classes", false, "classes");
}

void OpenStuApi::fetchRequired(const QString& date) {
    const QString d = date.isEmpty() ? QDate::currentDate().toString("yyyy-MM-dd") : date;
    get("/api/class/" + m_classId + "/homework/required?date=" + d, true, "required");
}

void OpenStuApi::fetchRoster() {
    get("/api/class/" + m_classId + "/students", true, "roster");
}

void OpenStuApi::fetchAllHomework() {
    get("/api/class/" + m_classId + "/homework", true, "homework");
}

void OpenStuApi::submit(int studentId, int subjectId, int typeId, const QString& date) {
    QJsonObject body;
    body["student_id"] = studentId;
    body["target_date"] = date.isEmpty() ? QDate::currentDate().toString("yyyy-MM-dd") : date;
    body["subject_id"] = subjectId;
    if (typeId >= 0) body["type_id"] = typeId;
    post("/api/class/" + m_classId + "/homework/update", body, true, "submit");
}

// ---- 硬件登记 ----
void OpenStuApi::fetchUuids() {
    QNetworkReply* reply = m_net->get(makeRequest("/api/class/" + m_classId + "/uuids", true));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) { emit failed(describeError(reply)); return; }
        emit uuidsReady(QJsonDocument::fromJson(reply->readAll()).object());
    });
}

void OpenStuApi::addUid(const QString& uidHex, int studentId) {
    const QJsonObject body{{"uid", uidHex}, {"student_id", studentId}};
    QNetworkReply* reply = m_net->post(makeRequest("/api/class/" + m_classId + "/uuids/add", true),
                                       QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit uidAdded(false, describeError(reply));
            return;
        }
        emit uidAdded(true, QStringLiteral("已绑定"));
    });
}
