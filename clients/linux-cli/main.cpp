// openstu-cli —— OpenStu 交作业系统的 Linux 命令行客户端
// 用法见 usage() 或 README.md
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <map>
#include <chrono>
#include <ctime>
#include <thread>
#include <fstream>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include "http.hpp"
#include "json.hpp"
#include "sha256.h"

using js::Value;

// ============================ 配置 ============================
struct Config {
    std::string server = "https://os-stu.netlify.app";
    std::string classId;
    std::string password;
};

static std::string configPath() {
    const char* home = getenv("HOME");
    return std::string(home ? home : ".") + "/.config/openstu-cli/config.json";
}

static void ensureConfigDir() {
    const char* home = getenv("HOME");
    std::string dir = std::string(home ? home : ".") + "/.config/openstu-cli";
    mkdir(dir.c_str(), 0700);
}

static Config loadConfig() {
    Config c;
    std::ifstream in(configPath());
    if (!in) return c;
    std::stringstream ss; ss << in.rdbuf();
    try {
        Value v = js::parse(ss.str());
        if (!v["server"].asStr().empty())   c.server   = v["server"].asStr();
        if (!v["class_id"].asStr().empty()) c.classId  = v["class_id"].asStr();
        if (!v["password"].asStr().empty()) c.password = v["password"].asStr();
    } catch (...) {}
    if (!c.server.empty() && c.server.back() == '/') c.server.pop_back();
    return c;
}

static void saveConfig(const Config& c) {
    ensureConfigDir();
    std::ofstream out(configPath());
    Value v = Value::obj()
        .set("server", Value::str(c.server))
        .set("class_id", Value::str(c.classId))
        .set("password", Value::str(c.password));
    out << v.dump() << "\n";
}

// ============================ 工具 ============================
static std::string today() {
    time_t t = time(nullptr);
    struct tm lt {};
    localtime_r(&t, &lt);
    char buf[32];
    snprintf(buf, sizeof buf, "%04d-%02d-%02d", lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday);
    return buf;
}

static int daysBetween(const std::string& a, const std::string& b) {
    auto pd = [](const std::string& s) {
        struct tm t {};
        sscanf(s.c_str(), "%d-%d-%d", &t.tm_year, &t.tm_mon, &t.tm_mday);
        t.tm_year -= 1900; t.tm_mon -= 1;
        return mktime(&t);
    };
    return (int)((pd(b) - pd(a)) / 86400);
}

static std::string utf8Pad(const std::string& s, size_t width) {
    // 按“显示宽度”：ASCII 算 1，UTF-8 多字节算 2（粗略够用）
    size_t w = 0;
    for (size_t i = 0; i < s.size(); ++i) {
        unsigned char c = s[i];
        if (c < 0x80) w += 1;
        else if ((c & 0xE0) == 0xC0) { w += 2; ++i; }
        else if ((c & 0xF0) == 0xE0) { w += 2; i += 2; }
        else { w += 2; i += 3; }
    }
    std::string r = s;
    while (w < width) { r += ' '; ++w; }
    return r;
}

static void die(const std::string& msg) {
    std::cerr << "错误: " << msg << "\n";
    exit(1);
}

// ============================ 接口 ============================
struct Client {
    Config cfg;

    std::vector<std::pair<std::string, std::string>> headers(bool auth, bool jsonBody) const {
        std::vector<std::pair<std::string, std::string>> h;
        if (jsonBody) h.push_back({"Content-Type", "application/json"});
        h.push_back({"Accept", "application/json"});
        if (auth) {
            if (!cfg.password.empty()) {
                h.push_back({"X-Password", cfg.password});
                h.push_back({"X-Password-Hash", sha::hex256(cfg.password)});
            }
        }
        return h;
    }

    Value get(const std::string& path, bool auth) const {
        auto r = http::request("GET", cfg.server + path, headers(auth, false));
        if (!r.ok()) throw std::runtime_error(httpError(r));
        return js::parse(r.body);
    }

    Value post(const std::string& path, const Value& body, bool auth) const {
        auto r = http::request("POST", cfg.server + path, headers(auth, true), body.dump());
        if (!r.ok()) throw std::runtime_error(httpError(r));
        return js::parse(r.body);
    }

    static std::string httpError(const http::Response& r) {
        std::string msg = "HTTP " + std::to_string(r.code);
        try {
            Value v = js::parse(r.body);
            std::string e = v["error"].asStr();
            if (!e.empty()) msg += " · " + e;
            std::string code = v["code"].asStr();
            if (!code.empty()) msg += " (" + code + ")";
            const Value& req = v["required"];
            if (req.isArr()) {
                msg += " · 今日应交:";
                for (auto& x : req.a) msg += " " + x.fmtNum();
            }
        } catch (...) {}
        return msg;
    }

    Value classes() const { return get("/api/classes", false); }
    Value students() const { return get("/api/class/" + cfg.classId + "/students", true); }
    Value required(const std::string& date) const {
        return get("/api/class/" + cfg.classId + "/homework/required?date=" + (date.empty() ? today() : date), true);
    }
    Value allHomework() const { return get("/api/class/" + cfg.classId + "/homework", true); }
    Value meta() const { return get("/api/class/" + cfg.classId + "/homework/meta", true); }

    Value submit(int studentId, int subjectId, int typeId, const std::string& date) const {
        Value b = Value::obj()
            .set("student_id", Value::num(studentId))
            .set("target_date", Value::str(date.empty() ? today() : date))
            .set("subject_id", Value::num(subjectId));
        if (typeId >= 0) b.set("type_id", Value::num(typeId));
        return post("/api/class/" + cfg.classId + "/homework/update", b, true);
    }
};

#include "classcmd.hpp"

// ============================ 展示 ============================
static void printProgress(int done, int total) {
    int width = 30;
    int fill = total > 0 ? (int)((long long)done * width / total) : 0;
    std::printf("[");
    for (int i = 0; i < width; ++i) std::printf(i < fill ? "█" : "·");
    std::printf("] %d/%d", done, total);
    if (total > 0) std::printf(" (%.0f%%)", 100.0 * done / total);
    std::printf("\n");
}

static void printRequired(const Value& req) {
    std::printf("日期: %s\n", req["date"].asStr().c_str());
    const Value& names = req["subjectNames"];
    const Value& list = req["required"];
    if (!list.isArr() || list.a.empty()) {
        std::printf("今天没有要交的作业。\n");
        return;
    }
    std::printf("应交科目:");
    for (size_t i = 0; i < list.a.size(); ++i) {
        int idx = list.a[i].asInt();
        std::string nm = names[std::to_string(idx)].asStr();
        std::printf(" [%d]%s", idx, nm.empty() ? "?" : nm.c_str());
    }
    std::printf("\n");
    printProgress(req["submitted"].asInt(), req["total"].asInt());
    std::printf("班级: %s · 学生 %d 人\n", req["class_id"].asStr().c_str(), req["studentCount"].asInt());
}

static void printRosterWithToday(const Client& c) {
    Value req = c.required("");
    Value st  = c.students();
    Value hw  = c.allHomework();

    const Value& names = st["students"];
    std::vector<std::pair<int, std::string>> roster;
    for (auto& kv : names.o) roster.push_back({atoi(kv.first.c_str()), kv.second.asStr()});
    std::sort(roster.begin(), roster.end());

    std::vector<int> subjects;
    for (auto& x : req["required"].a) subjects.push_back(x.asInt());

    std::string from = hw["dateFrom"].asStr();
    int dayIdx = from.empty() ? -1 : daysBetween(from, today());
    const Value& data = hw["data"];

    std::printf("%-6s %-10s", "学号", "姓名");
    for (int s : subjects) std::printf(" %-8s", req["subjectNames"][std::to_string(s)].asStr().c_str());
    std::printf("\n");

    int totalDone = 0, totalSlots = 0;
    for (auto& p : roster) {
        std::printf("%-6d %-10s", p.first, utf8Pad(p.second, 10).c_str());
        for (int s : subjects) {
            bool done = false;
            if (dayIdx >= 0 && dayIdx < (int)data.a.size()) {
                const Value& day = data.a[dayIdx];
                if (p.first < (int)day.a.size()) {
                    const Value& row = day.a[p.first];
                    if (s < (int)row.a.size()) done = row.a[s].asInt() != 0;
                }
            }
            std::printf(" %-8s", done ? "✓" : "·");
            totalDone += done ? 1 : 0;
            totalSlots += 1;
        }
        std::printf("\n");
    }
    std::printf("\n");
    printProgress(totalDone, totalSlots);
}

// ============================ 命令 ============================
static void usage() {
    std::printf(
        "openstu-cli —— OpenStu 交作业系统命令行客户端\n\n"
        "用法:\n"
        "  openstu-cli config --server URL --class CID --password PASS   写配置\n"
        "  openstu-cli config                                            查看配置\n"
        "  openstu-cli classes                                           列出所有班级\n"
        "  openstu-cli status [--date YYYY-MM-DD]                        今日应交 + 进度\n"
        "  openstu-cli list                                              名册 × 今日科目矩阵\n"
        "  openstu-cli submit <学号> --subject N [--type N] [--date D]    登记已交\n"
        "  openstu-cli watch [--interval 3]                              持续刷新进度\n"
        "  openstu-cli whoami                                            打印当前配置（不显示密码）\n\n"
        "班级数据 / 分数 / 金币（对应网页端「控制台 / 分数管理 / 金币系统 / 排名」）:\n"
        "  openstu-cli classinfo                                         班级概览（人数/均分/金币/分组/日志数）\n"
        "  openstu-cli scores [--top 10] [--gold]                         分数或金币排行\n"
        "  openstu-cli score <学号> +2 [--reason 说明]                    加/减分（写日志）\n"
        "  openstu-cli gold  <学号> +50 [--reason 说明]                   加/减金币\n"
        "  openstu-cli gacha <学号> [--times 10]                         抽奖（周五 12:00 后开放，160/1600 金币）\n\n"
        "学生历程 / 日志 / 分组（对应「学生历程 / 操作日志 / 分组管理」）:\n"
        "  openstu-cli journal <学号>                                    读历程\n"
        "  openstu-cli journal-add <学号> \"内容\" [--operator 姓名]       追加历程\n"
        "  openstu-cli journal-export                                    导出全班历程纯文本\n"
        "  openstu-cli logs [--n 30]                                      最近操作日志\n"
        "  openstu-cli groups                                            分组与组均分\n\n"
        "作业初始化 / 种类 / 绑卡（对应「作业初始化 / 硬件登记」）:\n"
        "  openstu-cli init --students 51 --subjects 语文,数学 [--start 2026-09-01]\n"
        "  openstu-cli types                                             已配置的作业种类\n"
        "  openstu-cli uid 12:34:56:78:9A:BC:DE 23 [--subject 0] [--type 1]\n"
        "  openstu-cli uids                                              全班卡号字典\n\n"
        "选项:\n"
        "  --subject 用索引（0 起），也可 --subject-name 语文\n"
        "  --type    作业种类索引（配了种类才有意义）\n"
        "  --json    机器可读输出\n");
}

static std::map<std::string, std::string> parseFlags(int argc, char** argv, std::vector<std::string>& positional) {
    std::map<std::string, std::string> f;
    for (int i = 2; i < argc; ++i) {
        std::string a = argv[i];
        if (a.rfind("--", 0) == 0) {
            std::string key = a.substr(2);
            if (key == "json" || key == "help") { f[key] = "1"; continue; }
            if (i + 1 < argc) f[key] = argv[++i];
        } else positional.push_back(a);
    }
    return f;
}

int main(int argc, char** argv) {
    if (argc < 2) { usage(); return 0; }
    std::string cmd = argv[1];
    if (cmd == "-h" || cmd == "--help" || cmd == "help") { usage(); return 0; }

    Config cfg = loadConfig();

    if (cmd == "config") {
        std::vector<std::string> pos;
        auto f = parseFlags(argc, argv, pos);
        if (f.count("server") || f.count("class") || f.count("password")) {
            if (f.count("server")) cfg.server = f["server"];
            if (f.count("class")) cfg.classId = f["class"];
            if (f.count("password")) cfg.password = f["password"];
            if (!cfg.server.empty() && cfg.server.back() == '/') cfg.server.pop_back();
            saveConfig(cfg);
            std::printf("已保存到 %s\n", configPath().c_str());
        }
        std::printf("server   : %s\nclass_id : %s\npassword : %s\n",
                    cfg.server.c_str(),
                    cfg.classId.empty() ? "(未设置)" : cfg.classId.c_str(),
                    cfg.password.empty() ? "(未设置)" : "(已设置)");
        return 0;
    }

    Client c{cfg};

    try {
        if (cmd == "classes") {
            Value v = c.classes();
            for (auto& x : v.a)
                std::printf("%-28s %-16s %s\n", x["id"].asStr().c_str(), x["name"].asStr().c_str(), x["created_at"].asStr().c_str());
            return 0;
        }

        const bool needCfg = cmd == "status" || cmd == "list" || cmd == "submit" || cmd == "watch" ||
                             cmd == "classinfo" || cmd == "scores" || cmd == "score" || cmd == "gold" ||
                             cmd == "gacha" || cmd == "journal" || cmd == "journal-add" || cmd == "journal-export" ||
                             cmd == "logs" || cmd == "groups" || cmd == "types" || cmd == "init" ||
                             cmd == "uid" || cmd == "uids";
        if (!cfg.classId.empty() && !cfg.password.empty() && needCfg) {
            // 正常分支
        } else if (needCfg) {
            die("还没配好，先跑: openstu-cli config --server ... --class ... --password ...");
        }

        if (cmd == "whoami") {
            std::printf("server: %s\nclass: %s\npassword: %s\n",
                        cfg.server.c_str(), cfg.classId.c_str(), cfg.password.empty() ? "(空)" : "(已隐藏)");
            return 0;
        }

        if (cmd == "status") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            Value req = c.required(f.count("date") ? f["date"] : "");
            if (f.count("json")) { std::printf("%s\n", req.dump().c_str()); return 0; }
            printRequired(req);
            return 0;
        }

        if (cmd == "list") {
            printRosterWithToday(c);
            return 0;
        }

        if (cmd == "submit") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.empty()) die("要指定学号: openstu-cli submit 23 --subject 0");
            int sid = atoi(pos[0].c_str());
            if (sid <= 0) die("学号必须是正整数");

            Value req = c.required(f.count("date") ? f["date"] : "");
            const Value& names = req["subjectNames"];

            int subject = -1;
            if (f.count("subject")) subject = atoi(f["subject"].c_str());
            else if (f.count("subject-name")) {
                std::string want = f["subject-name"];
                for (auto& kv : names.o) if (kv.second.asStr() == want) subject = atoi(kv.first.c_str());
                if (subject < 0) die("找不到科目: " + want);
            }
            if (subject < 0) {
                // 没给科目：今日只有一门就直接用它
                if (req["required"].a.size() == 1) subject = req["required"].a[0].asInt();
                else die("请用 --subject 指定科目索引（或 --subject-name 科目名）");
            }
            int type = f.count("type") ? atoi(f["type"].c_str()) : -1;

            Value r = c.submit(sid, subject, type, f.count("date") ? f["date"] : "");
            std::string nm = names[std::to_string(subject)].asStr();
            std::string subjLabel = nm.empty() ? ("科目" + std::to_string(subject)) : nm;
            std::printf("✓ 学号 %d · %s · %s · %s\n",
                        r["student_id"].asInt(),
                        r["target_date"].asStr().c_str(),
                        subjLabel.c_str(),
                        r["changed"].asBool() ? "已登记" : "原本就已交（未重复计分）");
            return 0;
        }

        if (cmd == "watch") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            int interval = f.count("interval") ? atoi(f["interval"].c_str()) : 3;
            if (interval < 1) interval = 1;
            while (true) {
                std::printf("\033[2J\033[H");  // 清屏
                std::printf("OpenStu · %s · 每 %d 秒刷新（Ctrl-C 退出）\n\n", cfg.classId.c_str(), interval);
                try {
                    printRequired(c.required(""));
                } catch (const std::exception& e) {
                    std::printf("刷新失败: %s\n", e.what());
                }
                std::fflush(stdout);
                std::this_thread::sleep_for(std::chrono::seconds(interval));
            }
        }

        if (cmd == "classinfo") return extra::cmdClassInfo(c);
        if (cmd == "scores") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            int top = f.count("top") ? atoi(f["top"].c_str()) : 0;
            return extra::cmdScores(c, top, f.count("gold") > 0);
        }
        if (cmd == "score") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.size() < 2) die("用法: score <学号> <变化，如 +2 / -1.5> [--reason 说明]");
            int sid = atoi(pos[0].c_str());
            double delta = atof(pos[1].c_str());
            return extra::cmdScore(c, sid, delta, f.count("reason") ? f["reason"] : "");
        }
        if (cmd == "gold") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.size() < 2) die("用法: gold <学号> <变化> [--reason 说明]");
            return extra::cmdGold(c, atoi(pos[0].c_str()), atof(pos[1].c_str()), f.count("reason") ? f["reason"] : "");
        }
        if (cmd == "gacha") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.empty()) die("用法: gacha <学号> [--times 10]");
            return extra::cmdGacha(c, atoi(pos[0].c_str()), f.count("times") ? atoi(f["times"].c_str()) : 1);
        }
        if (cmd == "journal") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.empty()) die("用法: journal <学号>");
            return extra::cmdJournal(c, atoi(pos[0].c_str()));
        }
        if (cmd == "journal-add") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.size() < 2) die("用法: journal-add <学号> \"内容\" [--operator 李老师]");
            return extra::cmdJournalAdd(c, atoi(pos[0].c_str()), pos[1], f.count("operator") ? f["operator"] : "");
        }
        if (cmd == "journal-export") return extra::cmdJournalExport(c);
        if (cmd == "logs") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            return extra::cmdLogs(c, f.count("n") ? atoi(f["n"].c_str()) : 30);
        }
        if (cmd == "groups") return extra::cmdGroups(c);
        if (cmd == "types") return extra::cmdTypes(c);
        if (cmd == "init") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            int students = f.count("students") ? atoi(f["students"].c_str()) : 0;
            if (students <= 0) die("用法: init --students 51 --subjects 语文,数学 [--start 2026-09-01]");
            std::vector<std::string> subs;
            if (f.count("subjects")) {
                std::string cur;
                for (char ch : f["subjects"]) {
                    if (ch == ',') { if (!cur.empty()) subs.push_back(cur); cur.clear(); }
                    else cur += ch;
                }
                if (!cur.empty()) subs.push_back(cur);
            }
            if (subs.empty()) die("--subjects 至少要有一个科目，如 语文,数学");
            return extra::cmdInit(c, students, subs, f.count("start") ? f["start"] : "");
        }
        if (cmd == "uid") {
            std::vector<std::string> pos;
            auto f = parseFlags(argc, argv, pos);
            if (pos.size() < 2) die("用法: uid <UID> <学号> [--subject 0] [--type 1] [--date YYYY-MM-DD]");
            return extra::cmdBindUid(c, pos[0], atoi(pos[1].c_str()),
                                     f.count("subject") ? atoi(f["subject"].c_str()) : -1,
                                     f.count("type") ? atoi(f["type"].c_str()) : -1,
                                     f.count("date") ? f["date"] : "");
        }
        if (cmd == "uids") return extra::cmdUids(c);

        usage();
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "错误: " << e.what() << "\n";
        return 1;
    }
}
