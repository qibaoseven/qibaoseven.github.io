#include "OpenStuWindow.h"
#include "OpenStuApi.h"
#include "OpenStuMoreDialog.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QLineEdit>
#include <QPushButton>
#include <QTableWidget>
#include <QHeaderView>
#include <QProgressBar>
#include <QLabel>
#include <QPlainTextEdit>
#include <QComboBox>
#include <QSettings>
#include <QJsonArray>
#include <QDate>
#include <QGroupBox>
#include <QMessageBox>
#include <QTime>
#include <QColor>
#include <algorithm>

OpenStuWindow::OpenStuWindow(QWidget* parent) : QWidget(parent) {
    buildUi();
    m_api = new OpenStuApi(this);
    connect(m_api, &OpenStuApi::classesReady,  this, &OpenStuWindow::onClassesReady);
    connect(m_api, &OpenStuApi::requiredReady, this, &OpenStuWindow::onRequiredReady);
    connect(m_api, &OpenStuApi::rosterReady,   this, &OpenStuWindow::onRosterReady);
    connect(m_api, &OpenStuApi::homeworkReady, this, [this](const QJsonObject& o) {
        m_homework = o;
        fillTable();
    });
    connect(m_api, &OpenStuApi::submitDone, this, &OpenStuWindow::onSubmitDone);
    connect(m_api, &OpenStuApi::failed,     this, &OpenStuWindow::onFailed);
    loadSettings();
}

void OpenStuWindow::buildUi() {
    setWindowTitle("OpenStu · 交作业登记");
    resize(880, 620);

    auto* root = new QVBoxLayout(this);

    // 连接设置
    auto* box = new QGroupBox("服务器 / 班级");
    auto* form = new QFormLayout(box);
    m_server   = new QLineEdit;
    m_classId  = new QLineEdit;
    m_password = new QLineEdit;
    m_password->setEchoMode(QLineEdit::Password);
    m_server->setPlaceholderText("https://os-stu.netlify.app");
    m_classId->setPlaceholderText("class_xxxxxxxx");
    form->addRow("服务器", m_server);
    form->addRow("班级 ID", m_classId);
    form->addRow("密码", m_password);

    auto* row = new QHBoxLayout;
    m_date = new QComboBox;
    m_date->setEditable(true);
    for (int i = 0; i >= -6; --i) m_date->addItem(QDate::currentDate().addDays(i).toString("yyyy-MM-dd"));
    m_save    = new QPushButton("保存");
    m_connect = new QPushButton("连接并刷新");
    m_more = new QPushButton("更多功能");
    row->addWidget(m_more);
    m_refresh = new QPushButton("刷新");
    row->addWidget(new QLabel("日期"));
    row->addWidget(m_date);
    row->addStretch();
    row->addWidget(m_save);
    row->addWidget(m_connect);
    row->addWidget(m_refresh);
    form->addRow(row);
    root->addWidget(box);

    // 状态 + 进度
    auto* statusRow = new QHBoxLayout;
    m_status = new QLabel("未连接");
    m_progress = new QProgressBar;
    m_progress->setMaximum(100);
    m_progress->setValue(0);
    statusRow->addWidget(m_status, 1);
    statusRow->addWidget(m_progress, 2);
    root->addLayout(statusRow);

    // 名册表格
    m_table = new QTableWidget;
    m_table->setSelectionBehavior(QAbstractItemView::SelectItems);
    m_table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    m_table->horizontalHeader()->setStretchLastSection(true);
    root->addWidget(m_table, 1);

    // 日志
    m_log = new QPlainTextEdit;
    m_log->setReadOnly(true);
    m_log->setMaximumBlockCount(200);
    m_log->setFixedHeight(110);
    root->addWidget(m_log);

    connect(m_save,    &QPushButton::clicked, this, &OpenStuWindow::onSaveSettings);
    connect(m_connect, &QPushButton::clicked, this, &OpenStuWindow::onConnect);
    connect(m_refresh, &QPushButton::clicked, this, &OpenStuWindow::refresh);
    connect(m_more, &QPushButton::clicked, this, &OpenStuWindow::onMore);
    connect(m_table,   &QTableWidget::cellClicked, this, &OpenStuWindow::onCellClicked);
}

void OpenStuWindow::log(const QString& s) {
    m_log->appendPlainText(QTime::currentTime().toString("HH:mm:ss ") + s);
}

void OpenStuWindow::loadSettings() {
    QSettings st;
    m_server->setText(st.value("server", "https://os-stu.netlify.app").toString());
    m_classId->setText(st.value("class_id").toString());
    m_password->setText(st.value("password").toString());
    if (!m_classId->text().isEmpty() && !m_password->text().isEmpty())
        m_status->setText("已载入配置，点“连接并刷新”");
}

void OpenStuWindow::onSaveSettings() {
    QSettings st;
    st.setValue("server", m_server->text().trimmed());
    st.setValue("class_id", m_classId->text().trimmed());
    st.setValue("password", m_password->text());
    log("配置已保存");
}

void OpenStuWindow::onConnect() {
    onSaveSettings();
    m_api->setConfig(m_server->text(), m_classId->text(), m_password->text());
    if (!m_api->hasConfig()) {
        QMessageBox::warning(this, "缺少配置", "班级 ID 和密码都要填。");
        return;
    }
    log("连接 " + m_server->text() + " · " + m_classId->text());
    refresh();
}

void OpenStuWindow::refresh() {
    if (!m_api->hasConfig()) m_api->setConfig(m_server->text(), m_classId->text(), m_password->text());
    if (!m_api->hasConfig()) { log("还没配好，先填班级 ID 和密码"); return; }
    m_api->fetchRequired(m_date->currentText());
    m_api->fetchRoster();
    m_api->fetchAllHomework();
}

QStringList OpenStuWindow::subjectNames() const {
    QStringList r;
    const QJsonObject names = m_required.value("subjectNames").toObject();
    for (const auto& s : requiredSubjects())
        r << names.value(QString::number(s)).toString(QString("科目%1").arg(s));
    return r;
}

QVector<int> OpenStuWindow::requiredSubjects() const {
    QVector<int> r;
    for (const auto& v : m_required.value("required").toArray()) r.push_back(v.toInt());
    return r;
}

void OpenStuWindow::onClassesReady(const QJsonArray& classes) {
    log(QString("服务器可达，共 %1 个班级").arg(classes.size()));
}

void OpenStuWindow::onRequiredReady(const QJsonObject& required) {
    m_required = required;
    const int submitted = required.value("submitted").toInt();
    const int total = required.value("total").toInt();
    m_progress->setMaximum(total > 0 ? total : 1);
    m_progress->setValue(submitted);
    m_status->setText(QString("%1 · 应交 %2 科 · 已交 %3/%4")
                          .arg(required.value("date").toString())
                          .arg(requiredSubjects().size())
                          .arg(submitted).arg(total));
    fillTable();
}

void OpenStuWindow::onRosterReady(const QJsonObject& roster) {
    m_roster = roster;
    fillTable();
}

void OpenStuWindow::fillTable() {
    const QVector<int> subs = requiredSubjects();
    const QJsonObject names = m_roster.value("students").toObject();
    if (names.isEmpty()) return;

    // 学号按数字排序
    QList<int> ids;
    for (auto it = names.begin(); it != names.end(); ++it) ids.push_back(it.key().toInt());
    std::sort(ids.begin(), ids.end());

    // 今日在 [dateFrom..] 的偏移，用于查已交状态
    const QJsonObject hw = m_homework;
    const QString from = hw.value("dateFrom").toString();
    const QString date = m_required.value("date").toString();
    const int dayIdx = (!from.isEmpty() && !date.isEmpty()) ? QDate::fromString(from, "yyyy-MM-dd").daysTo(QDate::fromString(date, "yyyy-MM-dd")) : -1;
    const QJsonArray data = hw.value("data").toArray();
    const QJsonObject subjNames = m_required.value("subjectNames").toObject();

    m_table->clear();
    m_table->setRowCount(ids.size());
    m_table->setColumnCount(2 + subs.size());
    QStringList hdr{"学号", "姓名"};
    for (int s : subs) hdr << subjNames.value(QString::number(s)).toString(QString("科目%1").arg(s));
    m_table->setHorizontalHeaderLabels(hdr);

    for (int r = 0; r < ids.size(); ++r) {
        const int sid = ids[r];
        m_table->setItem(r, 0, new QTableWidgetItem(QString::number(sid)));
        m_table->setItem(r, 1, new QTableWidgetItem(names.value(QString::number(sid)).toString()));

        for (int c = 0; c < subs.size(); ++c) {
            bool done = false;
            if (dayIdx >= 0 && dayIdx < data.size()) {
                const QJsonArray day = data.at(dayIdx).toArray();
                if (sid < day.size()) {
                    const QJsonArray rowData = day.at(sid).toArray();
                    const int s = subs[c];
                    if (s < rowData.size()) done = rowData.at(s).toInt() != 0;
                }
            }
            auto* item = new QTableWidgetItem(done ? "✓ 已交" : "· 未交");
            item->setTextAlignment(Qt::AlignCenter);
            item->setForeground(done ? QColor("#1a7f37") : QColor("#9a9a9a"));
            item->setData(Qt::UserRole, subs[c]);
            m_table->setItem(r, 2 + c, item);
        }
    }
    m_table->resizeColumnsToContents();
}

void OpenStuWindow::onCellClicked(int row, int column) {
    if (column < 2) return;                       // 学号/姓名列不响应
    auto* item = m_table->item(row, column);
    if (!item) return;
    const int subjectId = item->data(Qt::UserRole).toInt();
    const int studentId = m_table->item(row, 0)->text().toInt();

    auto* yes = new QMessageBox(QMessageBox::Question, "确认登记",
        QString("把 学号 %1 · %2 · %3 标记为已交？")
            .arg(studentId)
            .arg(m_table->item(row, 1)->text())
            .arg(m_table->horizontalHeaderItem(column)->text()),
        QMessageBox::Yes | QMessageBox::No, this);
    if (yes->exec() != QMessageBox::Yes) return;

    m_api->submit(studentId, subjectId, -1, m_required.value("date").toString());
}

void OpenStuWindow::onSubmitDone(const QJsonObject& result) {
    log(QString("登记成功: 学号 %1 · %2 · %3")
            .arg(result.value("student_id").toInt())
            .arg(result.value("target_date").toString())
            .arg(result.value("changed").toBool() ? "本次新登记" : "原本已交"));
    refresh();   // 重拉进度
}

void OpenStuWindow::onFailed(const QString& msg) {
    log("请求失败: " + msg);
    m_status->setText("错误: " + msg);
}

void OpenStuWindow::onMore() {
    if (!m_api->hasConfig()) {
        QMessageBox::information(this, QStringLiteral("还没配置"),
                                 QStringLiteral("先在下面填好服务器 / 班级 / 密码并保存，再打开更多功能。"));
        return;
    }
    OpenStuMoreDialog dlg(m_api, m_roster, this);
    dlg.exec();
    refresh();
}
