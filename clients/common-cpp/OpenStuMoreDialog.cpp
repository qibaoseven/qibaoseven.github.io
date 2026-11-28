#include "OpenStuMoreDialog.h"
#include "OpenStuApi.h"

#include <QTabWidget>
#include <QTableWidget>
#include <QHeaderView>
#include <QComboBox>
#include <QDoubleSpinBox>
#include <QSpinBox>
#include <QLineEdit>
#include <QLabel>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QDate>
#include <QTime>
#include <QDateTime>
#include <QJsonArray>
#include <QRandomGenerator>

OpenStuMoreDialog::OpenStuMoreDialog(OpenStuApi* api, const QJsonObject& roster, QWidget* parent)
    : QDialog(parent), m_api(api), m_roster(roster) {
    setWindowTitle(QStringLiteral("更多功能 · 分数 / 金币 / 抽奖 / 日志 / 初始化 / 历程"));
    resize(880, 640);
    buildUi();

    connect(m_api, &OpenStuApi::classDataReady, this, &OpenStuMoreDialog::onData);
    connect(m_api, &OpenStuApi::classDataSaved, this, &OpenStuMoreDialog::onSaved);
    connect(m_api, &OpenStuApi::metaReady, this, &OpenStuMoreDialog::onMeta);
    connect(m_api, &OpenStuApi::journalReady, this, &OpenStuMoreDialog::onJournal);

    m_api->fetchClassData();
    m_api->fetchMeta();
}

void OpenStuMoreDialog::buildUi() {
    auto* root = new QVBoxLayout(this);
    m_tabs = new QTabWidget(this);
    root->addWidget(m_tabs, 1);

    m_msg = new QLabel(QStringLiteral("数据加载中…"), this);
    m_msg->setWordWrap(true);
    root->addWidget(m_msg);

    // ---------- 分数 / 金币 ----------
    auto* scorePage = new QWidget(this);
    auto* sv = new QVBoxLayout(scorePage);
    m_table = new QTableWidget(0, 4, scorePage);
    m_table->setHorizontalHeaderLabels({QStringLiteral("姓名"), QStringLiteral("学号"),
                                        QStringLiteral("分数"), QStringLiteral("金币")});
    m_table->horizontalHeader()->setStretchLastSection(true);
    m_table->verticalHeader()->setVisible(false);
    m_table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    m_table->setSelectionBehavior(QAbstractItemView::SelectRows);
    connect(m_table, &QTableWidget::cellClicked, this, &OpenStuMoreDialog::onScoresClicked);
    sv->addWidget(m_table, 1);

    auto* form = new QFormLayout();
    m_delta = new QDoubleSpinBox(scorePage);
    m_delta->setRange(-1e6, 1e6);
    m_delta->setDecimals(1);
    m_delta->setValue(2.0);
    m_reason = new QLineEdit(scorePage);
    m_reason->setPlaceholderText(QStringLiteral("原因（写入操作日志）"));
    form->addRow(QStringLiteral("变化"), m_delta);
    form->addRow(QStringLiteral("原因"), m_reason);
    sv->addLayout(form);

    auto* buttons = new QHBoxLayout();
    auto* bScore = new QPushButton(QStringLiteral("提交分数调整"), scorePage);
    auto* bGold = new QPushButton(QStringLiteral("改为金币调整"), scorePage);
    connect(bScore, &QPushButton::clicked, this, [this]() { applyDelta(false); });
    connect(bGold, &QPushButton::clicked, this, [this]() { applyDelta(true); });
    buttons->addWidget(bScore);
    buttons->addWidget(bGold);
    sv->addLayout(buttons);
    m_tabs->addTab(scorePage, QStringLiteral("分数 / 金币"));

    // ---------- 抽奖 ----------
    auto* gachaPage = new QWidget(this);
    auto* gv = new QVBoxLayout(gachaPage);
    auto* gform = new QFormLayout();
    m_studentsForGacha = new QComboBox(gachaPage);
    gform->addRow(QStringLiteral("学生"), m_studentsForGacha);
    gv->addLayout(gform);
    auto* gh = new QHBoxLayout();
    auto* b1 = new QPushButton(QStringLiteral("单抽（160 金币）"), gachaPage);
    auto* b10 = new QPushButton(QStringLiteral("十连（1600 金币）"), gachaPage);
    connect(b1, &QPushButton::clicked, this, [this]() { draw(1); });
    connect(b10, &QPushButton::clicked, this, [this]() { draw(10); });
    gh->addWidget(b1);
    gh->addWidget(b10);
    gv->addLayout(gh);
    auto* tip = new QLabel(QStringLiteral("仅在周五 12:00 之后开放；奖励按班级数据 rewards 里的 probability 加权，"
                                          "hidden_rewards 记作 SP，抽到的学分直接加到该学生。"), gachaPage);
    tip->setWordWrap(true);
    gv->addWidget(tip);
    gv->addStretch(1);
    m_tabs->addTab(gachaPage, QStringLiteral("抽奖"));

    // ---------- 日志 ----------
    auto* logPage = new QWidget(this);
    auto* lv = new QVBoxLayout(logPage);
    m_logs = new QPlainTextEdit(logPage);
    m_logs->setReadOnly(true);
    lv->addWidget(m_logs);
    m_tabs->addTab(logPage, QStringLiteral("操作日志"));

    // ---------- 初始化 ----------
    auto* initPage = new QWidget(this);
    auto* iv = new QVBoxLayout(initPage);
    auto* iform = new QFormLayout();
    m_count = new QSpinBox(initPage);
    m_count->setRange(1, 200);
    m_count->setValue(51);
    m_subjects = new QLineEdit(QStringLiteral("语文,数学"), initPage);
    iform->addRow(QStringLiteral("学生数"), m_count);
    iform->addRow(QStringLiteral("科目（逗号分隔）"), m_subjects);
    iv->addLayout(iform);
    auto* warn = new QLabel(QStringLiteral("⚠ 初始化会重建作业数据（学生数 × 科目），已有作业记录会清空。"), initPage);
    warn->setWordWrap(true);
    iv->addWidget(warn);
    auto* bInit = new QPushButton(QStringLiteral("执行初始化"), initPage);
    connect(bInit, &QPushButton::clicked, this, &OpenStuMoreDialog::runInit);
    iv->addWidget(bInit);
    iv->addWidget(new QLabel(QStringLiteral("已配置的作业种类："), initPage));
    m_metaText = new QPlainTextEdit(initPage);
    m_metaText->setReadOnly(true);
    iv->addWidget(m_metaText, 1);
    m_tabs->addTab(initPage, QStringLiteral("初始化"));

    // ---------- 历程 ----------
    auto* jPage = new QWidget(this);
    auto* jv = new QVBoxLayout(jPage);
    auto* jh = new QHBoxLayout();
    m_journalStudent = new QComboBox(jPage);
    auto* bRead = new QPushButton(QStringLiteral("读取历程"), jPage);
    connect(bRead, &QPushButton::clicked, this, &OpenStuMoreDialog::readJournal);
    jh->addWidget(m_journalStudent, 1);
    jh->addWidget(bRead);
    jv->addLayout(jh);
    m_journalText = new QPlainTextEdit(jPage);
    m_journalText->setReadOnly(true);
    jv->addWidget(m_journalText, 1);
    m_journalInput = new QLineEdit(jPage);
    m_journalInput->setPlaceholderText(QStringLiteral("追加一段（纯文本，只能追加不能改）"));
    jv->addWidget(m_journalInput);
    auto* bAdd = new QPushButton(QStringLiteral("追加"), jPage);
    connect(bAdd, &QPushButton::clicked, this, &OpenStuMoreDialog::appendJournal);
    jv->addWidget(bAdd);
    m_tabs->addTab(jPage, QStringLiteral("学生历程"));

    // 名册下拉
    const QJsonObject students = m_roster.value("students").toObject();
    QStringList ids = students.keys();
    std::sort(ids.begin(), ids.end(), [](const QString& a, const QString& b) { return a.toInt() < b.toInt(); });
    for (const QString& sid : ids) {
        const QString label = sid + QStringLiteral(" ") + students.value(sid).toString();
        m_studentsForGacha->addItem(label, sid);
        m_journalStudent->addItem(label, sid);
    }
}

void OpenStuMoreDialog::fillTable() {
    const QJsonObject scores = m_data.value("scores").toObject();
    const QJsonObject golds = m_data.value("gold").toObject();
    QStringList ids = scores.keys();
    std::sort(ids.begin(), ids.end(), [](const QString& a, const QString& b) { return a.toInt() < b.toInt(); });

    struct Row { QString sid, name; double score, gold; };
    QVector<Row> rows;
    for (const QString& sid : ids) {
        if (sid == QLatin1String("0")) continue;
        const QJsonValue v = scores.value(sid);
        Row r{sid, QStringLiteral("学号%1").arg(sid), 0.0, 0.0};
        if (v.isArray()) {
            const QJsonArray a = v.toArray();
            r.name = a.at(0).toString(r.name);
            r.score = a.at(1).toDouble();
        } else if (v.isObject()) {
            const QJsonObject o = v.toObject();
            r.name = o.value("name").toString(r.name);
            r.score = o.value("score").toDouble();
        }
        r.gold = golds.value(sid).toObject().value("amount").toDouble();
        rows.push_back(r);
    }
    std::sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) { return a.score > b.score; });

    m_table->setRowCount(rows.size());
    for (int i = 0; i < rows.size(); ++i) {
        m_table->setItem(i, 0, new QTableWidgetItem(rows[i].name));
        m_table->setItem(i, 1, new QTableWidgetItem(rows[i].sid));
        auto* s = new QTableWidgetItem(QString::number(rows[i].score, 'f', 1));
        s->setData(Qt::UserRole, rows[i].sid);
        m_table->setItem(i, 2, s);
        m_table->setItem(i, 3, new QTableWidgetItem(QString::number(rows[i].gold, 'f', 0)));
    }
    m_table->resizeColumnsToContents();

    // 日志
    const QJsonArray logs = m_data.value("logs").toArray();
    QStringList lines;
    for (int i = 0; i < qMin(logs.size(), 60); ++i) {
        const QJsonObject l = logs.at(i).toObject();
        lines << QStringLiteral("%1 · %2 · %3 %4%5 · %6")
                 .arg(l.value("timestamp").toString(), l.value("action").toString(),
                      l.value("student_name").toString())
                 .arg(l.value("score_change").toDouble() >= 0 ? "+" : "")
                 .arg(l.value("score_change").toDouble())
                 .arg(l.value("reason").toString());
    }
    m_logs->setPlainText(lines.isEmpty() ? QStringLiteral("（暂无日志）") : lines.join('\n'));
}

QString OpenStuMoreDialog::sidOf(int row) const {
    auto* item = m_table->item(row, 2);
    return item ? item->data(Qt::UserRole).toString() : QString();
}

QString OpenStuMoreDialog::nameOf(const QString& sid) const {
    return m_data.value("scores").toObject().value(sid).isArray()
        ? m_data.value("scores").toObject().value(sid).toArray().at(0).toString()
        : m_data.value("scores").toObject().value(sid).toObject().value("name").toString();
}

void OpenStuMoreDialog::onData(const QJsonObject& data) {
    m_data = data;
    fillTable();
    m_msg->setText(QStringLiteral("已加载：%1 人 · %2 条日志")
                       .arg(m_data.value("scores").toObject().size())
                       .arg(m_data.value("logs").toArray().size()));
}

void OpenStuMoreDialog::onSaved(bool ok, const QString& message) {
    m_msg->setText(ok ? QStringLiteral("✓ ") + message : QStringLiteral("失败：") + message);
    if (ok) {
        m_api->fetchClassData();
        m_api->fetchMeta();
    }
}

void OpenStuMoreDialog::onMeta(const QJsonObject& meta) {
    const QJsonObject types = meta.value("types").toObject();
    const QJsonObject names = meta.value("subjectNames").toObject();
    QStringList lines;
    for (const QString& k : types.keys()) {
        lines << QStringLiteral("科目%1（%2）：%3 种")
                     .arg(k)
                     .arg(names.value(k).toString(QStringLiteral("未命名")))
                     .arg(types.value(k).toArray().size());
    }
    m_metaText->setPlainText(lines.isEmpty() ? QStringLiteral("（没配作业种类：所有科目按“整科已交”计）")
                                             : lines.join('\n'));
}

void OpenStuMoreDialog::onScoresClicked(int row, int) {
    const QString sid = sidOf(row);
    if (sid.isEmpty()) return;
    const int idx = m_studentsForGacha->findData(sid);
    if (idx >= 0) m_studentsForGacha->setCurrentIndex(idx);
    const int jdx = m_journalStudent->findData(sid);
    if (jdx >= 0) m_journalStudent->setCurrentIndex(jdx);
}

void OpenStuMoreDialog::applyDelta(bool asGold) {
    const QString sid = m_studentsForGacha->currentData().toString();
    if (sid.isEmpty()) { m_msg->setText(QStringLiteral("先在表格里点一个学生，或在“抽奖”页选一个学生")); return; }
    const double v = m_delta->value();
    const QString reason = m_reason->text().trimmed();

    QJsonObject scores = m_data.value("scores").toObject();
    if (!scores.contains(sid)) { m_msg->setText(QStringLiteral("没有学号 ") + sid); return; }
    const QJsonValue before = scores.value(sid);
    QString name = QStringLiteral("学号") + sid;
    double newScore = 0.0, newGold = 0.0, oldScore = 0.0;

    if (!asGold) {
        if (before.isArray()) {
            QJsonArray a = before.toArray();
            name = a.at(0).toString(name);
            oldScore = a.at(1).toDouble();
            newScore = oldScore + v;
            a.replace(1, newScore);
            scores[sid] = a;
        } else {
            QJsonObject o = before.toObject();
            name = o.value("name").toString(name);
            oldScore = o.value("score").toDouble();
            newScore = oldScore + v;
            o["score"] = newScore;
            scores[sid] = o;
        }
        m_data["scores"] = scores;
    }

    QJsonObject golds = m_data.value("gold").toObject();
    QJsonObject entry = golds.value(sid).toObject();
    if (entry.isEmpty()) entry = QJsonObject{{"amount", 0.0}};
    const double oldGold = entry.value("amount").toDouble();
    if (asGold) {
        newGold = qMax(0.0, oldGold + v);
        entry["amount"] = newGold;
    }
    golds[sid] = entry;
    m_data["gold"] = golds;

    QJsonArray logs = m_data.value("logs").toArray();
    QJsonObject log{
        {"timestamp", QDateTime::currentDateTime().toString("yyyy/MM/dd HH:mm:ss")},
        {"action", asGold ? QStringLiteral("金币调整") : QStringLiteral("分数调整")},
        {"student_id", sid}, {"student_name", name},
        {"score_change", asGold ? v : v},
        {"current_score", asGold ? newGold : newScore},
        {"reason", reason}, {"page", QStringLiteral("qt")}, {"user_role", QStringLiteral("teacher")}
    };
    logs.insert(0, log);
    while (logs.size() > 2000) logs.removeLast();
    m_data["logs"] = logs;

    m_api->saveClassData(m_data);
    m_msg->setText(asGold ? QStringLiteral("提交金币调整：%1 %2 → %3").arg(name).arg(oldGold).arg(newGold)
                          : QStringLiteral("提交分数调整：%1 %2 → %3").arg(name).arg(oldScore).arg(newScore));
}

void OpenStuMoreDialog::draw(int times) {
    const QDate today = QDate::currentDate();
    if (today.dayOfWeek() != 5 || QTime::currentTime().hour() < 12) {
        m_msg->setText(QStringLiteral("抽奖只在周五 12:00 之后开放"));
        return;
    }
    const QString sid = m_studentsForGacha->currentData().toString();
    if (sid.isEmpty()) { m_msg->setText(QStringLiteral("先选一个学生")); return; }
    const double cost = times >= 10 ? 1600.0 : 160.0;

    QJsonObject golds = m_data.value("gold").toObject();
    QJsonObject entry = golds.value(sid).toObject();
    const double have = entry.value("amount").toDouble();
    if (have < cost) {
        m_msg->setText(QStringLiteral("金币不够：现有 %1，需要 %2").arg(have).arg(cost));
        return;
    }

    // 奖励池
    QStringList names; QVector<int> weights; QVector<double> gains;
    const QJsonObject rewards = m_data.value("rewards").toObject();
    for (const QString& rarity : rewards.keys()) {
        if (rarity == QLatin1String("hidden_rewards")) continue;
        for (const QJsonValue& v : rewards.value(rarity).toArray()) {
            const QJsonObject r = v.toObject();
            names << QStringLiteral("[%1] %2").arg(rarity, r.value("name").toString());
            weights << qMax(1, r.value("probability").toInt(1));
            gains << r.value("score").toDouble();
        }
    }
    for (const QJsonValue& v : rewards.value("hidden_rewards").toArray()) {
        const QJsonObject r = v.toObject();
        names << QStringLiteral("[SP] %1").arg(r.value("name").toString());
        weights << qMax(1, r.value("probability").toInt(1));
        gains << r.value("score").toDouble();
    }
    int total = 0;
    for (int w : weights) total += w;

    QJsonObject scores = m_data.value("scores").toObject();
    QJsonValue row = scores.value(sid);
    QString name = QStringLiteral("学号") + sid;
    double score = 0.0;
    if (row.isArray()) { name = row.toArray().at(0).toString(name); score = row.toArray().at(1).toDouble(); }

    QStringList lines;
    const int count = times >= 10 ? 10 : 1;
    for (int i = 0; i < count; ++i) {
        int pick = total > 0 ? QRandomGenerator::global()->bounded(total) : -1;
        int idx = -1;
        for (int k = 0; k < weights.size(); ++k) { if (pick < 0) break; pick -= weights[k]; if (pick < 0) { idx = k; break; } }
        if (idx < 0) { lines << QStringLiteral("谢谢参与"); continue; }
        score += gains[idx];
        lines << (gains[idx] != 0 ? QStringLiteral("%1 +%2 学分").arg(names[idx]).arg(gains[idx]) : names[idx]);
    }

    if (row.isArray()) {
        QJsonArray a = row.toArray();
        a.replace(1, score);
        scores[sid] = a;
    } else {
        QJsonObject o = row.toObject();
        o["score"] = score;
        scores[sid] = o;
    }
    m_data["scores"] = scores;

    entry["amount"] = have - cost;
    golds[sid] = entry;
    m_data["gold"] = golds;

    QJsonArray logs = m_data.value("logs").toArray();
    QJsonObject log{
        {"timestamp", QDateTime::currentDateTime().toString("yyyy/MM/dd HH:mm:ss")},
        {"action", times >= 10 ? QStringLiteral("十连抽消耗") : QStringLiteral("抽奖消耗")},
        {"student_id", sid}, {"student_name", name},
        {"score_change", -cost}, {"current_score", have - cost},
        {"reason", QStringLiteral("%1 次").arg(times)},
        {"page", QStringLiteral("qt")}, {"user_role", QStringLiteral("teacher")}
    };
    logs.insert(0, log);
    while (logs.size() > 2000) logs.removeLast();
    m_data["logs"] = logs;

    m_api->saveClassData(m_data);
    m_msg->setText(lines.join('\n') + QStringLiteral("\n金币 %1 → %2 · 学分 %3").arg(have).arg(have - cost).arg(score));
}

void OpenStuMoreDialog::runInit() {
    const QStringList parts = m_subjects->text().split(',', Qt::SkipEmptyParts);
    QStringList subjects;
    for (const QString& s : parts) if (!s.trimmed().isEmpty()) subjects << s.trimmed();
    if (subjects.isEmpty()) { m_msg->setText(QStringLiteral("科目不能空")); return; }
    m_api->initHomework(m_count->value(), subjects);
}

void OpenStuMoreDialog::readJournal() {
    m_api->fetchJournal(m_journalStudent->currentData().toInt());
}

void OpenStuMoreDialog::onJournal(int studentId, const QString& text) {
    m_journalText->setPlainText(text.isEmpty() ? QStringLiteral("（还没有历程记录）") : text);
}

void OpenStuMoreDialog::appendJournal() {
    const QString text = m_journalInput->text().trimmed();
    if (text.isEmpty()) return;
    m_journalInput->clear();
    const int sid = m_journalStudent->currentData().toInt();
    m_api->addJournal(sid, text);
    m_api->fetchJournal(sid);
}
