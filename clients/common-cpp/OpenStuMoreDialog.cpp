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
#include <QJsonDocument>
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

    // ---------- 其它：职位 / 考试 / 汇报 / 备份 / 账号 ----------
    auto* extraPage = new QWidget(this);
    auto* ev = new QVBoxLayout(extraPage);
    m_extra = new QPlainTextEdit(extraPage);
    m_extra->setReadOnly(true);
    ev->addWidget(m_extra, 1);
    auto* bPay = new QPushButton(QStringLiteral("给所有班干发工资（进金币）"), extraPage);
    connect(bPay, &QPushButton::clicked, this, &OpenStuMoreDialog::paySalaries);
    ev->addWidget(bPay);
    // ---------------- 分组管理 ----------------
    auto* groupPage = new QWidget(this);
    auto* gpv = new QVBoxLayout(groupPage);
    auto* gRow = new QHBoxLayout;
    m_groupName = new QLineEdit(groupPage);
    m_groupName->setPlaceholderText(QStringLiteral("分组名，如 第一组"));
    m_groupMember = new QComboBox(groupPage);
    for (const QString& sid : m_roster.keys()) {
        const QString nm = nameOf(sid);
        m_groupMember->addItem(nm + QStringLiteral(" (") + sid + QStringLiteral(")"), sid);
    }
    gRow->addWidget(m_groupName);
    gRow->addWidget(m_groupMember);
    gpv->addLayout(gRow);
    auto* gBtns = new QHBoxLayout;
    auto* bGC = new QPushButton(QStringLiteral("创建分组"), groupPage);
    auto* bGD = new QPushButton(QStringLiteral("删除分组"), groupPage);
    auto* bGA = new QPushButton(QStringLiteral("➕ 加入选中学生"), groupPage);
    auto* bGR = new QPushButton(QStringLiteral("➖ 移出选中学生"), groupPage);
    connect(bGC, &QPushButton::clicked, this, &OpenStuMoreDialog::groupCreate);
    connect(bGD, &QPushButton::clicked, this, &OpenStuMoreDialog::groupDelete);
    connect(bGA, &QPushButton::clicked, this, &OpenStuMoreDialog::groupAdd);
    connect(bGR, &QPushButton::clicked, this, &OpenStuMoreDialog::groupRemove);
    gBtns->addWidget(bGC); gBtns->addWidget(bGD); gBtns->addWidget(bGA); gBtns->addWidget(bGR);
    gpv->addLayout(gBtns);
    m_groupView = new QPlainTextEdit(groupPage);
    m_groupView->setReadOnly(true);
    gpv->addWidget(m_groupView);
    m_groupMsg = new QLabel(groupPage);
    gpv->addWidget(m_groupMsg);
    m_tabs->addTab(groupPage, QStringLiteral("分组"));

    // ---------------- 每日汇报 ----------------
    auto* reportPage = new QWidget(this);
    auto* repv = new QVBoxLayout(reportPage);
    m_reportView = new QPlainTextEdit(reportPage);
    m_reportView->setReadOnly(true);
    repv->addWidget(m_reportView);
    auto* rRow = new QHBoxLayout;
    m_reportDelta = new QDoubleSpinBox(reportPage);
    m_reportDelta->setRange(-20, 20);
    m_reportDelta->setSingleStep(0.5);
    m_reportDelta->setValue(2);
    m_reportReason = new QLineEdit(reportPage);
    m_reportReason->setPlaceholderText(QStringLiteral("批量加分原因，如 完成今日作业"));
    rRow->addWidget(new QLabel(QStringLiteral("全班加减"), reportPage));
    rRow->addWidget(m_reportDelta);
    rRow->addWidget(m_reportReason);
    repv->addLayout(rRow);
    auto* rBtns = new QHBoxLayout;
    auto* bAll = new QPushButton(QStringLiteral("✅ 全部已汇报"), reportPage);
    auto* bApply = new QPushButton(QStringLiteral("⬇ 批量应用到全班"), reportPage);
    auto* bReset = new QPushButton(QStringLiteral("↺ 重置今日汇报"), reportPage);
    connect(bAll, &QPushButton::clicked, this, &OpenStuMoreDialog::reportMarkAll);
    connect(bApply, &QPushButton::clicked, this, &OpenStuMoreDialog::reportBatchApply);
    connect(bReset, &QPushButton::clicked, this, &OpenStuMoreDialog::reportReset);
    rBtns->addWidget(bAll); rBtns->addWidget(bApply); rBtns->addWidget(bReset);
    repv->addLayout(rBtns);
    m_reportMsg = new QLabel(reportPage);
    repv->addWidget(m_reportMsg);
    m_tabs->addTab(reportPage, QStringLiteral("每日汇报"));

    m_tabs->addTab(extraPage, QStringLiteral("其它"));

    // ---------- 自动事件 ----------
    auto* evPage = new QWidget(this);
    auto* evv = new QVBoxLayout(evPage);
    m_events = new QPlainTextEdit(evPage);
    m_events->setReadOnly(true);
    evv->addWidget(m_events, 1);
    auto* bRun = new QPushButton(QStringLiteral("▶ 立即执行到期事件"), evPage);
    connect(bRun, &QPushButton::clicked, this, &OpenStuMoreDialog::runEvents);
    evv->addWidget(bRun);
    auto* evForm = new QFormLayout();
    m_evName = new QLineEdit(QStringLiteral("每周一加分"), evPage);
    m_evFreq = new QLineEdit(QStringLiteral("weekly:1"), evPage);
    m_evTargets = new QLineEdit(QStringLiteral("all"), evPage);
    m_evChange = new QDoubleSpinBox(evPage);
    m_evChange->setRange(-100, 100); m_evChange->setValue(1);
    m_evReason = new QLineEdit(evPage);
    evForm->addRow(QStringLiteral("名称"), m_evName);
    evForm->addRow(QStringLiteral("频率 daily / weekly:1 / monthly:15"), m_evFreq);
    evForm->addRow(QStringLiteral("目标 all / group:组名 / 学号"), m_evTargets);
    evForm->addRow(QStringLiteral("分值"), m_evChange);
    evForm->addRow(QStringLiteral("原因"), m_evReason);
    evv->addLayout(evForm);
    auto* bEvAdd = new QPushButton(QStringLiteral("添加事件"), evPage);
    connect(bEvAdd, &QPushButton::clicked, this, &OpenStuMoreDialog::addEvent);
    evv->addWidget(bEvAdd);
    m_tabs->addTab(evPage, QStringLiteral("自动事件"));

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

    // 其它页：职位 / 考试 / 汇报 / 备份 / 账号
    QStringList extra;
    const QJsonObject pos = m_data.value("positions").toObject();
    const QJsonObject list = pos.value("list").toObject();
    for (const QString& name : list.keys()) {
        const QJsonObject item = list.value(name).toObject();
        QStringList members;
        for (const QJsonValue& m : item.value("members").toArray()) members << m.toString();
        extra << QStringLiteral("👔 %1  月薪 %2 · %3")
                    .arg(name).arg(item.value("salary").toDouble())
                    .arg(members.isEmpty() ? QStringLiteral("（空缺）") : members.join(QStringLiteral("、")));
    }
    extra << QStringLiteral("上次发薪: %1").arg(pos.value("lastPayDate").toString(QStringLiteral("从未")));
    const QJsonObject exams = m_data.value("examScores").toObject();
    for (const QString& sid : exams.keys()) {
        for (const QJsonValue& v : exams.value(sid).toArray()) {
            const QJsonObject e = v.toObject();
            extra << QStringLiteral("📝 %1 %2 %3 %4/%5")
                        .arg(sid, e.value("subject").toString(), e.value("name").toString())
                        .arg(e.value("score").toDouble()).arg(e.value("full").toDouble());
        }
    }
    const QJsonObject dr = m_data.value("dailyReport").toObject();
    for (const QString& day : dr.keys()) {
        const QJsonObject o = dr.value(day).toObject();
        extra << QStringLiteral("📋 %1 汇报: %2").arg(day)
                    .arg(o.value("allReported").toBool() ? QStringLiteral("✅ 已全部汇报") : QStringLiteral("⭕ 未完成"));
    }
    extra << QStringLiteral("💾 整班数据 %1 字节（备份=原样导出这段 JSON）")
                .arg(QJsonDocument(m_data).toJson(QJsonDocument::Compact).size());
    extra << QStringLiteral("🔑 服务器 %1 · 班级 %2 · 密码 %3")
                .arg(m_api->server(), m_api->classId(),
                     m_api->hasConfig() ? QStringLiteral("已设置") : QStringLiteral("未设置"));
    extra << QStringLiteral("账号权限（root/admin/user）由网页端角色决定，桌面端只按班级密码鉴权。");
    m_extra->setPlainText(extra.join('\n'));

    // 自动事件列表
    QStringList evLines;
    const QJsonArray events = m_data.value("autoEvents").toArray();
    for (int i = 0; i < events.size(); ++i) {
        const QJsonObject e = events.at(i).toObject();
        const QString freq = e.value("frequency").toString(QStringLiteral("daily"));
        QString when;
        if (freq == QLatin1String("weekly")) when = QStringLiteral("周%1").arg(e.value("dayOfWeek").toInt());
        else if (freq == QLatin1String("monthly")) when = QStringLiteral("%1 日").arg(e.value("dayOfMonth").toInt());
        QStringList targets;
        for (const QJsonValue& t : e.value("targets").toArray()) targets << t.toString();
        evLines << QStringLiteral("[%1] %2  %3 %4  %+5  %6\n     目标: %7")
                        .arg(i).arg(e.value("name").toString())
                        .arg(freq, when, QString::number(e.value("change").toDouble(), 'f', 1))
                        .arg(e.value("reason").toString())
                        .arg(targets.join(QStringLiteral(", ")));
    }
    m_events->setPlainText(evLines.isEmpty() ? QStringLiteral("（还没有自动事件）") : evLines.join('\n'));
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
    refreshGroupsView();
    refreshReportView();
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

void OpenStuMoreDialog::runEvents() {
    QJsonArray events = m_data.value("autoEvents").toArray();
    if (events.isEmpty()) { m_msg->setText(QStringLiteral("（还没有自动事件）")); return; }
    const QDate today = QDate::currentDate();
    const QString key = today.toString("yyyy-MM-dd");
    QJsonObject scores = m_data.value("scores").toObject();
    const QJsonObject groups = m_data.value("groups").toObject();
    int applied = 0;

    for (int i = 0; i < events.size(); ++i) {
        QJsonObject e = events.at(i).toObject();
        const QString freq = e.value("frequency").toString(QStringLiteral("daily"));
        bool due = false;
        if (freq == QLatin1String("daily")) due = true;
        else if (freq == QLatin1String("weekly")) due = (today.dayOfWeek() % 7) == e.value("dayOfWeek").toInt(1);
        else if (freq == QLatin1String("monthly")) due = today.day() == e.value("dayOfMonth").toInt(1);
        if (!due) continue;
        QJsonObject lastRun = e.value("lastRun").toObject();
        if (lastRun.value(key).toBool()) continue;

        QStringList ids;
        for (const QJsonValue& t : e.value("targets").toArray()) {
            const QString tg = t.toString();
            if (tg == QLatin1String("all")) ids << scores.keys();
            else if (tg.startsWith(QStringLiteral("group:"))) {
                for (const QJsonValue& m : groups.value(tg.mid(6)).toArray()) ids << m.toString();
            } else ids << tg;
        }
        ids.removeDuplicates();
        const double change = e.value("change").toDouble();
        for (const QString& sid : ids) {
            if (sid == QLatin1String("0") || !scores.contains(sid)) continue;
            QJsonValue row = scores.value(sid);
            QString name = QStringLiteral("学号") + sid;
            double newScore = 0;
            if (row.isArray()) {
                QJsonArray a = row.toArray();
                name = a.at(0).toString(name);
                newScore = a.at(1).toDouble() + change;
                a.replace(1, newScore);
                scores[sid] = a;
            } else {
                QJsonObject o = row.toObject();
                name = o.value("name").toString(name);
                newScore = o.value("score").toDouble() + change;
                o["score"] = newScore;
                scores[sid] = o;
            }
            QJsonArray logs = m_data.value("logs").toArray();
            logs.insert(0, QJsonObject{
                {"timestamp", QDateTime::currentDateTime().toString("yyyy/MM/dd HH:mm:ss")},
                {"action", QStringLiteral("自动事件")}, {"student_id", sid}, {"student_name", name},
                {"score_change", change}, {"current_score", newScore},
                {"reason", e.value("reason").toString(QStringLiteral("自动事件"))},
                {"page", QStringLiteral("qt")}, {"user_role", QStringLiteral("system")}
            });
            while (logs.size() > 2000) logs.removeLast();
            m_data["logs"] = logs;
            ++applied;
        }
        lastRun[key] = true;
        e["lastRun"] = lastRun;
        events.replace(i, e);
    }
    m_data["scores"] = scores;
    m_data["autoEvents"] = events;
    m_api->saveClassData(m_data);
    m_msg->setText(QStringLiteral("✓ 执行完成：改动 %1 人次").arg(applied));
}

void OpenStuMoreDialog::addEvent() {
    const QString name = m_evName->text().trimmed();
    if (name.isEmpty()) { m_msg->setText(QStringLiteral("名称不能空")); return; }
    const QStringList parts = m_evFreq->text().split(':');
    QJsonObject e{
        {"name", name}, {"frequency", parts.value(0)},
        {"change", m_evChange->value()},
        {"reason", m_evReason->text().trimmed().isEmpty() ? QStringLiteral("自动事件") : m_evReason->text().trimmed()},
        {"lastRun", QJsonObject()}
    };
    if (parts.value(0) == QLatin1String("weekly")) e["dayOfWeek"] = parts.value(1).toInt();
    if (parts.value(0) == QLatin1String("monthly")) e["dayOfMonth"] = parts.value(1).toInt();
    QJsonArray targets;
    for (const QString& t : m_evTargets->text().split(',', Qt::SkipEmptyParts))
        if (!t.trimmed().isEmpty()) targets.append(t.trimmed());
    if (targets.isEmpty()) { m_msg->setText(QStringLiteral("目标不能空")); return; }
    e["targets"] = targets;
    QJsonArray events = m_data.value("autoEvents").toArray();
    events.append(e);
    m_data["autoEvents"] = events;
    m_api->saveClassData(m_data);
    m_msg->setText(QStringLiteral("✓ 已添加「%1」").arg(name));
}

void OpenStuMoreDialog::paySalaries() {
    const QJsonObject pos = m_data.value("positions").toObject();
    const QJsonObject list = pos.value("list").toObject();
    if (list.isEmpty()) { m_msg->setText(QStringLiteral("（还没有职位）")); return; }
    QJsonObject golds = m_data.value("gold").toObject();
    double total = 0; int people = 0;
    for (const QString& name : list.keys()) {
        const QJsonObject item = list.value(name).toObject();
        const double salary = item.value("salary").toDouble();
        for (const QJsonValue& m : item.value("members").toArray()) {
            const QString sid = m.toString();
            QJsonObject e = golds.value(sid).toObject();
            e["amount"] = e.value("amount").toDouble() + salary;
            golds[sid] = e;
            total += salary; ++people;
        }
    }
    m_data["gold"] = golds;
    QJsonObject p2 = pos;
    p2["lastPayDate"] = QDate::currentDate().toString("yyyy-MM-dd");
    m_data["positions"] = p2;
    m_api->saveClassData(m_data);
    m_msg->setText(QStringLiteral("✓ 发放 %1 人次，共 %2 金币").arg(people).arg(total));
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

// ======================= 分组管理 =======================
void OpenStuMoreDialog::refreshGroupsView() {
    if (!m_groupView) return;
    const QJsonObject groups = m_data.value("groups").toObject();
    const QJsonObject scores = m_data.value("scores").toObject();
    QString s;
    if (groups.isEmpty()) s = QStringLiteral("（还没有分组，建一个试试）\n");
    for (auto it = groups.begin(); it != groups.end(); ++it) {
        const QJsonArray members = it.value().toArray();
        double sum = 0; int n = 0; QStringList names;
        for (const QJsonValue& mv : members) {
            const QString sid = mv.toString();
            const QJsonValue& sv = scores.value(sid);
            double sc = sv.isArray() ? sv.toArray().at(1).toDouble()
                                     : sv.toObject().value("score").toDouble();
            sum += sc; n++;
            names << nameOf(sid);
        }
        s += QStringLiteral("▸ %1（%2 人，均分 %3）\n    成员：%4\n\n")
                 .arg(it.key()).arg(n).arg(n ? sum / n : 0.0)
                 .arg(names.isEmpty() ? QStringLiteral("（空）") : names.join(QStringLiteral("、")));
    }
    m_groupView->setPlainText(s);
}

void OpenStuMoreDialog::groupCreate() {
    const QString g = m_groupName->text().trimmed();
    if (g.isEmpty()) { m_groupMsg->setText(QStringLiteral("先填分组名")); return; }
    QJsonObject groups = m_data.value("groups").toObject();
    if (groups.contains(g)) { m_groupMsg->setText(QStringLiteral("分组已存在：") + g); return; }
    groups[g] = QJsonArray();
    m_data["groups"] = groups;
    m_api->saveClassData(m_data);
    m_groupMsg->setText(QStringLiteral("已创建分组：") + g);
    refreshGroupsView();
}

void OpenStuMoreDialog::groupDelete() {
    const QString g = m_groupName->text().trimmed();
    QJsonObject groups = m_data.value("groups").toObject();
    if (!groups.contains(g)) { m_groupMsg->setText(QStringLiteral("没有这个分组：") + g); return; }
    groups.remove(g);
    m_data["groups"] = groups;
    m_api->saveClassData(m_data);
    m_groupMsg->setText(QStringLiteral("已删除分组：") + g);
    refreshGroupsView();
}

void OpenStuMoreDialog::groupAdd() {
    const QString g = m_groupName->text().trimmed();
    const QString sid = m_groupMember->currentData().toString();
    QJsonObject groups = m_data.value("groups").toObject();
    if (!groups.contains(g)) { m_groupMsg->setText(QStringLiteral("先创建或选中已存在的分组名")); return; }
    QJsonArray members = groups.value(g).toArray();
    bool has = false;
    for (const QJsonValue& v : members) if (v.toString() == sid) has = true;
    if (!has) members.append(sid);
    groups[g] = members;
    m_data["groups"] = groups;
    m_api->saveClassData(m_data);
    m_groupMsg->setText(QStringLiteral("已把 %1 加入「%2」").arg(nameOf(sid)).arg(g));
    refreshGroupsView();
}

void OpenStuMoreDialog::groupRemove() {
    const QString g = m_groupName->text().trimmed();
    const QString sid = m_groupMember->currentData().toString();
    QJsonObject groups = m_data.value("groups").toObject();
    if (!groups.contains(g)) { m_groupMsg->setText(QStringLiteral("没有这个分组：") + g); return; }
    QJsonArray members = groups.value(g).toArray();
    QJsonArray keep;
    for (const QJsonValue& v : members) if (v.toString() != sid) keep.append(v);
    groups[g] = keep;
    m_data["groups"] = groups;
    m_api->saveClassData(m_data);
    m_groupMsg->setText(QStringLiteral("已把 %1 移出「%2」").arg(nameOf(sid)).arg(g));
    refreshGroupsView();
}

// ======================= 每日汇报 =======================
static QString reportToday() {
    return QDate::currentDate().toString(QStringLiteral("yyyy-MM-dd"));
}

void OpenStuMoreDialog::refreshReportView() {
    if (!m_reportView) return;
    const QJsonObject dr = m_data.value("dailyReport").toObject();
    const QString today = reportToday();
    const QJsonObject t = dr.value(today).toObject();
    QString s = QStringLiteral("今日 %1\n状态：%2\n最后汇报：%3\n\n最近 7 天：\n")
                    .arg(today)
                    .arg(t.value("allReported").toBool() ? QStringLiteral("✅ 全部已汇报") : QStringLiteral("⏳ 进行中"))
                    .arg(t.value("lastReportTime").toString(QStringLiteral("（无）")));
    for (auto it = dr.begin(); it != dr.end(); ++it) {
        s += QStringLiteral("  %1  %2\n").arg(it.key())
                 .arg(it.value().toObject().value("allReported").toBool() ? QStringLiteral("全部已汇报")
                                                                          : QStringLiteral("未全部汇报"));
    }
    m_reportView->setPlainText(s);
}

void OpenStuMoreDialog::reportMarkAll() {
    QJsonObject dr = m_data.value("dailyReport").toObject();
    QJsonObject today = dr.value(reportToday()).toObject();
    today["allReported"] = true;
    today["lastReportTime"] = QDateTime::currentDateTime().toString(QStringLiteral("HH:mm:ss"));
    dr[reportToday()] = today;
    m_data["dailyReport"] = dr;
    m_api->saveClassData(m_data);
    m_reportMsg->setText(QStringLiteral("已标记全班已汇报"));
    refreshReportView();
}

void OpenStuMoreDialog::reportReset() {
    QJsonObject dr = m_data.value("dailyReport").toObject();
    dr.remove(reportToday());
    m_data["dailyReport"] = dr;
    m_api->saveClassData(m_data);
    m_reportMsg->setText(QStringLiteral("已重置今日汇报状态"));
    refreshReportView();
}

void OpenStuMoreDialog::reportBatchApply() {
    const double v = m_reportDelta->value();
    const QString reason = m_reportReason->text().trimmed();
    if (qFuzzyIsNull(v)) { m_reportMsg->setText(QStringLiteral("加减值不能为 0")); return; }
    QJsonObject scores = m_data.value("scores").toObject();
    QJsonArray logs = m_data.value("logs").toArray();
    int n = 0;
    for (auto it = scores.begin(); it != scores.end(); ++it) {
        if (it.key() == QStringLiteral("0")) continue;
        const QJsonValue before = it.value();
        QString name = QStringLiteral("学号") + it.key();
        double oldScore = 0, newScore = 0;
        if (before.isArray()) {
            QJsonArray a = before.toArray();
            name = a.at(0).toString(name);
            oldScore = a.at(1).toDouble();
            newScore = oldScore + v;
            a.replace(1, newScore);
            scores[it.key()] = a;
        } else {
            QJsonObject o = before.toObject();
            name = o.value("name").toString(name);
            oldScore = o.value("score").toDouble();
            newScore = oldScore + v;
            o["score"] = newScore;
            scores[it.key()] = o;
        }
        logs.insert(0, QJsonObject{
            {"timestamp", QDateTime::currentDateTime().toString(QStringLiteral("yyyy/MM/dd HH:mm:ss"))},
            {"action", QStringLiteral("每日汇报批量加分")},
            {"student_id", it.key()}, {"student_name", name},
            {"score_change", v}, {"current_score", newScore},
            {"reason", reason.isEmpty() ? QStringLiteral("每日汇报") : reason},
            {"page", QStringLiteral("qt")}, {"user_role", QStringLiteral("teacher")}
        });
        n++;
    }
    while (logs.size() > 2000) logs.removeLast();
    m_data["scores"] = scores;
    m_data["logs"] = logs;
    QJsonObject dr = m_data.value("dailyReport").toObject();
    QJsonObject today = dr.value(reportToday()).toObject();
    today["allReported"] = true;
    today["lastReportTime"] = QDateTime::currentDateTime().toString(QStringLiteral("HH:mm:ss"));
    dr[reportToday()] = today;
    m_data["dailyReport"] = dr;
    m_api->saveClassData(m_data);
    m_reportMsg->setText(QStringLiteral("已对 %1 人批量 %2%3").arg(n).arg(v > 0 ? "+" : "").arg(v));
    refreshReportView();
    fillTable();
}
