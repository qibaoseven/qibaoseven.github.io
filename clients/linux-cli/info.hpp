// 终端渲染层：`openstu-cli info <页面>`，把网页每个页面上的内容用数据 + 字符图表画出来
#pragma once
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>
#include "json.hpp"
#include "sha256.h"

namespace info {

using js::Value;

inline size_t dispW(const std::string& s) {
    size_t w = 0;
    for (size_t i = 0; i < s.size(); ++i) {
        unsigned char c = s[i];
        if (c < 0x80) w += 1;
        else if ((c & 0xE0) == 0xC0) { w += 2; ++i; }
        else if ((c & 0xF0) == 0xE0) { w += 2; i += 2; }
        else { w += 2; i += 3; }
    }
    return w;
}

inline std::string pad(const std::string& s, size_t w) {
    std::string r = s;
    size_t cur = dispW(s);
    while (cur < w) { r += ' '; ++cur; }
    return r;
}

inline std::string cut(const std::string& s, size_t w) {
    std::string r;
    size_t cur = 0;
    for (size_t i = 0; i < s.size();) {
        unsigned char c = s[i];
        size_t step = c < 0x80 ? 1 : ((c & 0xE0) == 0xC0 ? 2 : ((c & 0xF0) == 0xE0 ? 3 : 4));
        size_t add = c < 0x80 ? 1 : 2;
        if (cur + add > w) break;
        r += s.substr(i, step);
        cur += add;
        i += step;
    }
    return r;
}

inline std::string num(double v, int dp = 1) {
    char buf[64];
    if (std::fabs(v - (double)(long long)v) < 1e-9 && dp <= 0)
        snprintf(buf, sizeof buf, "%lld", (long long)v);
    else snprintf(buf, sizeof buf, "%.*f", dp, v);
    return buf;
}

inline void rule(size_t w = 62) {
    std::string r;
    for (size_t i = 0; i < w; ++i) r += "─";
    std::printf("%s\n", r.c_str());
}

inline void title(const std::string& t) {
    std::printf("\n");
    rule();
    std::printf("%s\n", t.c_str());
    rule();
}

inline void kv(const std::string& k, const std::string& v) {
    std::printf("  %s %s\n", pad(k, 16).c_str(), v.c_str());
}

// 横向条：value / max，24 格
inline std::string bar(double v, double maxv, size_t width = 24, bool neg = false) {
    if (maxv <= 0) maxv = 1;
    double r = std::fabs(v) / maxv;
    if (r > 1) r = 1;
    size_t n = (size_t)(r * (double)width);
    std::string s;
    const std::string full = neg ? "\u2592" : "\u2588";
    for (size_t i = 0; i < width; ++i) s += (i < n ? full : "\u2591");
    return s;
}

// 竖向柱（用于分布图）
inline void vbars(const std::vector<std::pair<std::string, double>>& rows, double maxv, int height = 8) {
    if (rows.empty()) return;
    if (maxv <= 0) maxv = 1;
    for (int h = height; h > 0; --h) {
        std::printf("  ");
        for (auto& r : rows) {
            double frac = r.second / maxv;
            int lvl = (int)std::ceil(frac * height);
            std::printf("%s", lvl >= h ? " \u2588 " : "   ");
        }
        std::printf("\n");
    }
    std::printf("  ");
    for (auto& r : rows) std::printf("%s", pad(r.first, 3).c_str());
    std::printf("\n");
}

struct Row {
    std::string sid, name;
    double score = 0, gold = 0;
    int rank = 0;
};

inline std::vector<Row> rowsOf(const Value& data) {
    std::vector<Row> out;
    const Value& scores = data["scores"];
    for (auto& kv : scores.o) {
        if (kv.first == "0") continue;
        Row r;
        r.sid = kv.first;
        if (kv.second.isArr() && kv.second.a.size() >= 2) {
            r.name = kv.second.a[0].asStr();
            r.score = kv.second.a[1].isNum() ? kv.second.a[1].n : atof(kv.second.a[1].asStr().c_str());
        } else if (kv.second.isObj()) {
            r.name = kv.second["name"].asStr();
            r.score = kv.second["score"].isNum() ? kv.second["score"].n : atof(kv.second["score"].asStr().c_str());
        } else if (kv.second.isNum()) {
            r.name = "学号" + kv.first;
            r.score = kv.second.n;
        }
        const Value& g = data["gold"][kv.first];
        r.gold = g.isObj() ? g["amount"].n : (g.isNum() ? g.n : 0);
        out.push_back(r);
    }
    std::sort(out.begin(), out.end(), [](const Row& a, const Row& b) { return a.score > b.score; });
    for (size_t i = 0; i < out.size(); ++i) out[i].rank = (int)i + 1;
    return out;
}

inline double median(std::vector<double> v) {
    if (v.empty()) return 0;
    std::sort(v.begin(), v.end());
    size_t n = v.size();
    return n % 2 ? v[n / 2] : (v[n / 2 - 1] + v[n / 2]) / 2.0;
}

inline std::string todayStr() {
    time_t t = time(nullptr);
    struct tm lt {};
    localtime_r(&t, &lt);
    char buf[32];
    snprintf(buf, sizeof buf, "%04d-%02d-%02d", lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday);
    return buf;
}

// ------------------------------ 各页面 ------------------------------

inline int dashboard(const Value& data, const Value& cls) {
    std::vector<Row> rows = rowsOf(data);
    double sum = 0, gsum = 0, mx = -1e9, mn = 1e9;
    for (auto& r : rows) { sum += r.score; gsum += r.gold; mx = std::max(mx, r.score); mn = std::min(mn, r.score); }
    double avg = rows.empty() ? 0 : sum / (double)rows.size();
    title("📊 系统控制台 (dashboard)");
    kv("班级", cls["name"].asStr().empty() ? "(未命名)" : cls["name"].asStr());
    kv("班级 ID", cls["id"].asStr());
    kv("学生人数", std::to_string(rows.size()));
    kv("学分总分", num(sum, 0));
    kv("平均分", num(avg));
    kv("最高 / 最低", num(mx, 0) + " / " + num(mn, 0));
    kv("中位数", num(median([&] { std::vector<double> v; for (auto& r : rows) v.push_back(r.score); return v; }())));
    kv("金币总额", num(gsum, 0));
    kv("分组数", std::to_string(data["groups"].o.size()));
    kv("日志条数", std::to_string(data["logs"].a.size()));
    kv("自动事件", std::to_string(data["autoEvents"].a.size()));
    const Value& dr = data["dailyReport"][todayStr()];
    kv("今日汇报", dr["allReported"].asBool() ? "全部已汇报" :
       (dr.t == Value::NUL ? "未开始" : "进行中 " + dr["lastReportTime"].asStr()));
    kv("考试记录", [&] {
        int n = 0;
        for (auto& kv2 : data["examScores"].o) n += (int)kv2.second.a.size();
        return std::to_string(n);
    }());
    std::printf("\n  学分分布（每 10 分一档）\n");
    std::vector<std::pair<std::string, double>> buckets;
    int lo = (int)std::floor(mn / 10.0) * 10, hi = (int)std::floor(mx / 10.0) * 10;
    for (int b = lo; b <= hi; b += 10) {
        int cnt = 0;
        for (auto& r : rows) if (r.score >= b && r.score < b + 10) cnt++;
        buckets.push_back({std::to_string(b), (double)cnt});
    }
    double bmax = 1;
    for (auto& b : buckets) bmax = std::max(bmax, b.second);
    vbars(buckets, bmax);
    std::printf("\n  学分前 5\n");
    for (size_t i = 0; i < rows.size() && i < 5; ++i)
        std::printf("  %s %s %s %s\n", pad("#" + std::to_string(rows[i].rank), 4).c_str(),
                    pad(cut(rows[i].name, 12), 14).c_str(), pad(num(rows[i].score, 0), 5).c_str(),
                    bar(rows[i].score, mx, 20).c_str());
    return 0;
}

inline int students(const Value& data) {
    std::vector<Row> rows = rowsOf(data);
    std::vector<double> v;
    for (auto& r : rows) v.push_back(r.score);
    double mx = v.empty() ? 1 : *std::max_element(v.begin(), v.end());
    title("📊 我的分数 / 学生名册（my_score）");
    std::printf("  %s %s %s %s %s\n", pad("排名", 4).c_str(), pad("学号", 5).c_str(),
                pad("姓名", 14).c_str(), pad("学分", 6).c_str(), "金币");
    for (auto& r : rows)
        std::printf("  %s %s %s %s %s\n", pad("#" + std::to_string(r.rank), 4).c_str(),
                    pad(r.sid, 5).c_str(), pad(cut(r.name, 12), 14).c_str(),
                    pad(num(r.score, 0), 6).c_str(), num(r.gold, 0).c_str());
    double sum = 0;
    for (double x : v) sum += x;
    kv("平均 / 中位 / 最高 / 最低",
       num(v.empty() ? 0 : sum / v.size()) + " / " + num(median(v)) + " / " + num(mx, 0) + " / " +
       num(v.empty() ? 0 : *std::min_element(v.begin(), v.end()), 0));
    std::printf("\n  相对最高分的条形图\n");
    for (auto& r : rows)
        std::printf("  %s %s\n", pad(cut(r.name, 10), 12).c_str(), bar(r.score, mx, 24).c_str());
    return 0;
}

inline int rank(const Value& data) {
    std::vector<Row> rows = rowsOf(data);
    double mx = rows.empty() ? 1 : rows[0].score;
    title("🏆 排名管理（rank）");
    std::printf("  个人榜\n");
    for (auto& r : rows)
        std::printf("  %s %s %s %s\n", pad("#" + std::to_string(r.rank), 4).c_str(),
                    pad(cut(r.name, 10), 12).c_str(), pad(num(r.score, 0), 5).c_str(),
                    bar(r.score, mx, 28).c_str());
    std::printf("\n  分组榜（组内均分）\n");
    std::vector<std::pair<std::string, double>> g;
    for (auto& kv : data["groups"].o) {
        double s = 0; int n = 0;
        for (auto& m : kv.second.a) {
            for (auto& r : rows) if (r.sid == m.asStr()) { s += r.score; n++; }
        }
        g.push_back({kv.first, n ? s / n : 0});
        std::printf("  %s 人数 %s 均分 %s\n", pad(cut(kv.first, 10), 12).c_str(),
                    pad(std::to_string(n), 4).c_str(), num(n ? s / n : 0).c_str());
    }
    double gmax = 1;
    for (auto& x : g) gmax = std::max(gmax, x.second);
    std::printf("\n  组均分对比\n");
    for (auto& x : g)
        std::printf("  %s %s\n", pad(cut(x.first, 10), 12).c_str(), bar(x.second, gmax, 24).c_str());
    return 0;
}

inline int groups(const Value& data) {
    std::vector<Row> rows = rowsOf(data);
    title("👥 分组管理（group）");
    if (data["groups"].o.empty()) std::printf("  （还没有分组）\n");
    for (auto& kv : data["groups"].o) {
        double s = 0; int n = 0;
        std::string names;
        for (auto& m : kv.second.a) {
            for (auto& r : rows) if (r.sid == m.asStr()) { s += r.score; n++; names += r.name + " "; }
        }
        std::printf("\n  ▸ %s（%d 人，均分 %.1f）\n", kv.first.c_str(), n, n ? s / n : 0);
        std::printf("    成员：%s\n", names.empty() ? "（空）" : names.c_str());
    }
    return 0;
}

inline int gold(const Value& data) {
    std::vector<Row> rows = rowsOf(data);
    std::vector<Row> g = rows;
    std::sort(g.begin(), g.end(), [](const Row& a, const Row& b) { return a.gold > b.gold; });
    double total = 0;
    for (auto& r : g) total += r.gold;
    title("💰 金币系统（gold）");
    kv("兑换率", "1 学分 = " + num(data["exchangeRate"]["score_to_gold"].isNum() ? data["exchangeRate"]["score_to_gold"].n : 0.1, 2) +
       " 金币，1 金币 = " + num(data["exchangeRate"]["gold_to_score"].isNum() ? data["exchangeRate"]["gold_to_score"].n : 1.0, 2) + " 学分");
    kv("金币总额", num(total, 0));
    kv("人均", num(g.empty() ? 0 : total / g.size(), 0));
    const Value& tasks = data["goldTasks"];
    kv("金币任务", std::to_string(tasks.isArr() ? tasks.a.size() : 0));
    std::printf("\n  金币榜\n");
    double mx = g.empty() ? 1 : g[0].gold;
    for (size_t i = 0; i < g.size(); ++i)
        std::printf("  %s %s %s %s\n", pad("#" + std::to_string(i + 1), 4).c_str(),
                    pad(cut(g[i].name, 10), 12).c_str(), pad(num(g[i].gold, 0), 6).c_str(),
                    bar(g[i].gold, mx, 24).c_str());
    if (tasks.isArr() && !tasks.a.empty()) {
        std::printf("\n  金币任务\n");
        for (auto& t : tasks.a)
            std::printf("  · %s  %s 金币 %s\n", t["name"].asStr().c_str(), t["desc"].asStr().c_str(),
                        num(t["reward"].n, 0).c_str());
    }
    const Value& hist = data["goldHistory"];
    if (hist.isArr() && !hist.a.empty()) {
        std::printf("\n  金币历史（最近 %zu 条）\n", std::min<size_t>(hist.a.size(), 10));
        for (size_t i = 0; i < hist.a.size() && i < 10; ++i) {
            auto& h = hist.a[i];
            std::printf("  %s %s %s %s\n", h["timestamp"].asStr().substr(0, 16).c_str(),
                        pad(h["student_name"].asStr(), 10).c_str(),
                        pad(h["amount"].isNum() ? num(h["amount"].n, 0) : h["amount"].asStr(), 6).c_str(),
                        h["reason"].asStr().c_str());
        }
    }
    return 0;
}

inline int gacha(const Value& data) {
    title("🎰 学分抽奖（gacha）");
    kv("单抽", "160 学分");
    kv("十连", "1600 学分");
    kv("开放时间", "周五 12:00 之后");
    const Value& rewards = data["rewards"];
    std::printf("\n  奖励池\n");
    double totalW = 0;
    for (auto& kv : rewards.o) for (auto& r : kv.second.a) totalW += r["probability"].isNum() ? r["probability"].n : 0;
    for (auto& kv : rewards.o) {
        std::printf("  %s\n", kv.first.c_str());
        for (auto& r : kv.second.a) {
            double p = r["probability"].isNum() ? r["probability"].n : 0;
            std::printf("    %s %s %s 概率 %s%%\n", pad(cut(r["name"].asStr(), 14), 16).c_str(),
                        pad(r["type"].asStr(), 6).c_str(),
                        pad(num(r["value"].n, 0), 5).c_str(),
                        num(totalW > 0 ? p / totalW * 100 : 0, 1).c_str());
        }
    }
    const Value& hidden = data["hidden_rewards"];
    kv("隐藏奖励(SP)", std::to_string(hidden.isArr() ? hidden.a.size() : 0));
    const Value& hist = data["gachaHistory"];
    kv("抽奖记录", std::to_string(hist.isArr() ? hist.a.size() : 0));
    if (hist.isArr())
        for (size_t i = 0; i < hist.a.size() && i < 10; ++i)
            std::printf("    %s %s %s\n", hist.a[i]["timestamp"].asStr().substr(0, 16).c_str(),
                        hist.a[i]["student_name"].asStr().c_str(), hist.a[i]["reward"].asStr().c_str());
    return 0;
}

inline int logs(const Value& data) {
    const Value& l = data["logs"];
    title("📜 操作日志（logs）");
    std::printf("  共 %zu 条\n", l.a.size());
    if (!l.a.empty()) {
        std::printf("\n  %s %s %s %s %s\n", pad("时间", 17).c_str(), pad("学生", 12).c_str(),
                    pad("变动", 6).c_str(), pad("现分", 5).c_str(), "原因");
        for (size_t i = 0; i < l.a.size() && i < 25; ++i) {
            auto& x = l.a[i];
            std::printf("  %s %s %s %s %s\n", pad(x["timestamp"].asStr().substr(0, 16), 17).c_str(),
                        pad(cut(x["student_name"].asStr(), 10), 12).c_str(),
                        pad((x["score_change"].isNum() && x["score_change"].n > 0 ? "+" : "") +
                            num(x["score_change"].n, 0), 6).c_str(),
                        pad(num(x["current_score"].n, 0), 5).c_str(),
                        cut(x["reason"].asStr(), 20).c_str());
        }
        std::printf("\n  按操作类型统计\n");
        std::map<std::string, int> cnt;
        for (auto& x : l.a) cnt[x["action"].asStr()]++;
        int mx = 1;
        for (auto& c : cnt) mx = std::max(mx, c.second);
        for (auto& c : cnt)
            std::printf("    %s %s %d\n", pad(cut(c.first, 12), 14).c_str(), bar((double)c.second, mx, 20).c_str(), c.second);
    }
    return 0;
}

inline int exam(const Value& data) {
    title("📝 考试分数（exam）");
    const Value& ex = data["examScores"];
    if (ex.o.empty()) std::printf("  （还没有考试数据）\n");
    std::vector<Row> rows = rowsOf(data);
    std::map<std::string, std::vector<double>> bySubject;
    std::map<std::string, std::vector<double>> byStudent;
    for (auto& kv : ex.o) {
        std::string name = kv.first;
        for (auto& r : rows) if (r.sid == kv.first) name = r.name;
        for (auto& rec : kv.second.a) {
            bySubject[rec["subject"].asStr()].push_back(rec["score"].n);
            byStudent[name].push_back(rec["score"].n);
        }
    }
    for (auto& kv : bySubject) {
        auto& v = kv.second;
        double sum = 0; for (double x : v) sum += x;
        std::printf("\n  ▸ %s（%zu 次） 平均 %s 中位 %s 最高 %s 最低 %s\n", kv.first.c_str(), v.size(),
                    num(sum / v.size()).c_str(), num(median(v)).c_str(),
                    num(*std::max_element(v.begin(), v.end())).c_str(),
                    num(*std::min_element(v.begin(), v.end())).c_str());
    }
    if (!byStudent.empty()) {
        std::printf("\n  学生总分\n");
        std::vector<std::pair<std::string, double>> s;
        for (auto& kv : byStudent) { double t = 0; for (double x : kv.second) t += x; s.push_back({kv.first, t}); }
        std::sort(s.begin(), s.end(), [](auto& a, auto& b) { return a.second > b.second; });
        double mx = s.empty() ? 1 : s[0].second;
        for (auto& x : s)
            std::printf("  %s %s %s\n", pad(cut(x.first, 10), 12).c_str(), pad(num(x.second, 0), 6).c_str(),
                        bar(x.second, mx, 20).c_str());
    }
    return 0;
}

inline int daily(const Value& data) {
    title("📋 每日汇报（daily_report）");
    const Value& dr = data["dailyReport"];
    std::printf("  最近 7 天\n");
    for (auto& kv : dr.o) {
        std::string state = kv.second["allReported"].asBool()
            ? "✅ 全部已汇报"
            : "⏳ " + (kv.second["lastReportTime"].asStr().empty() ? "未开始" : "最后 " + kv.second["lastReportTime"].asStr());
        std::printf("  %s  %s\n", kv.first.c_str(), state.c_str());
    }
    const Value& t = dr[todayStr()];
    kv("今日", t.t == Value::NUL ? "还没有记录" : (t["allReported"].asBool() ? "全部已汇报" : "进行中"));
    kv("学生", std::to_string(rowsOf(data).size()) + " 人");
    return 0;
}

inline int positions(const Value& data) {
    title("💼 职位与工资（positions）");
    const Value& p = data["positions"];
    kv("默认工资", num(p["defaultSalary"].n, 0));
    kv("上次发工资", p["lastPayDate"].asStr().empty() ? "（未发过）" : p["lastPayDate"].asStr());
    for (auto& kv : p["list"].o) {
        std::printf("\n  ▸ %s  工资 %s\n", kv.first.c_str(), num(kv.second["salary"].n, 0).c_str());
        std::string who;
        for (auto& m : kv.second["members"].a) {
            if (m.isObj()) {
                std::string nm = m["name"].asStr();
                who += (nm.empty() ? m["sid"].asStr() : nm) + " ";
            } else who += m.asStr() + " ";
        }
        std::printf("    成员：%s\n", who.empty() ? "（空）" : who.c_str());
    }
    return 0;
}

inline int events(const Value& data) {
    title("⚡ 自动事件（autoEvents）");
    const Value& e = data["autoEvents"];
    if (e.a.empty()) std::printf("  （还没有自动事件）\n");
    for (size_t i = 0; i < e.a.size(); ++i) {
        auto& x = e.a[i];
        std::string freq = x["frequency"].asStr().empty() ? "daily" : x["frequency"].asStr();
        std::string when = freq == "weekly" ? "周" + x["dayOfWeek"].asStr()
                         : (freq == "monthly" ? x["dayOfMonth"].asStr() + " 日" : "每天");
        std::string tg;
        for (auto& t : x["targets"].a) tg += t.asStr() + " ";
        std::printf("\n  [%zu] %s\n", i, x["name"].asStr().c_str());
        std::string chg = (x["change"].n >= 0 ? "+" : "") + num(x["change"].n, 0);
        std::printf("      %s %s  分值 %s  目标 %s\n", freq.c_str(), when.c_str(), chg.c_str(), tg.c_str());
        std::string last;
        for (auto& kv : x["lastRun"].o) if (kv.second.asBool()) last += kv.first + " ";
        std::printf("      最后执行：%s\n", last.empty() ? "（从未）" : last.c_str());
    }
    return 0;
}

inline int account(const std::string& server, const std::string& cid, const std::string& pw) {
    title("👤 账号管理（account）");
    kv("服务器", server);
    kv("班级 ID", cid);
    kv("密码", pw.empty() ? "（未设置）" : pw.substr(0, 2) + "…（已设置）");
    kv("密码哈希", sha::hex256(pw).substr(0, 16) + "…");
    std::printf("\n  可改项：server / class / password（配置命令见 help）\n");
    return 0;
}

inline int backup(const Value& data) {
    title("💾 数据备份（backup）");
    kv("学生", std::to_string(data["scores"].o.size()));
    kv("日志", std::to_string(data["logs"].a.size()));
    kv("分组", std::to_string(data["groups"].o.size()));
    kv("自动事件", std::to_string(data["autoEvents"].a.size()));
    kv("体积(序列化)", std::to_string(data.dump().size()) + " 字节");
    return 0;
}

inline int punishment(const Value& data) {
    title("🎯 惩罚管理（punishment）");
    const Value& pool = data["punishments"];
    kv("惩罚池", std::to_string(pool.o.size() + (pool.isArr() ? pool.a.size() : 0)) + " 项");
    const Value& mine = data["myPunishments"];
    kv("我的惩罚", std::to_string(mine.isArr() ? mine.a.size() : 0));
    if (mine.isArr())
        for (auto& p : mine.a)
            std::printf("  · %s %s %s\n", p["date"].asStr().c_str(), p["name"].asStr().c_str(),
                        p["completed"].asBool() ? "✅ 已完成" : "⏳ 待完成");
    return 0;
}

}  // namespace info
