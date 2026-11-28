// 班级数据 / 分数 / 金币 / 抽奖 / 历程 / 作业初始化 —— 网页端功能在 CLI 上的对应实现
// 依赖 main.cpp 里已定义好的 Client（含 get/post）与 js::Value
#pragma once
#include <algorithm>
#include <random>
#include <tuple>
#include <ctime>

namespace extra {

// ---------- 班级数据读写 ----------
inline js::Value loadClassData(const Client& c) {
    js::Value root = c.get("/api/class/" + c.cfg.classId, true);
    return root["data"];
}

inline void saveClassData(const Client& c, const js::Value& data) {
    js::Value body = js::Value::obj().set("data", data);
    c.post("/api/class/" + c.cfg.classId, body, true);
}

inline std::string ts() {
    time_t t = time(nullptr);
    struct tm lt {};
    localtime_r(&t, &lt);
    char buf[64];
    snprintf(buf, sizeof buf, "%04d/%02d/%02d %02d:%02d:%02d",
             lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday, lt.tm_hour, lt.tm_min, lt.tm_sec);
    return buf;
}

// scores 支持两种形态：[姓名, 分数] 或 {name, score}
inline double scoreOf(const js::Value& scores, const std::string& sid) {
    const js::Value& v = scores[sid];
    if (v.isArr()) return v.a.size() > 1 ? v.a[1].n : 0;
    return v["score"].n;
}
inline std::string nameOf(const js::Value& scores, const std::string& sid) {
    const js::Value& v = scores[sid];
    if (v.isArr()) return v.a.empty() ? ("学号" + sid) : v.a[0].asStr();
    return v["name"].asStr();
}
inline void setScore(js::Value& scores, const std::string& sid, double val) {
    js::Value& v = scores.o[sid];
    if (v.isArr()) { if (v.a.size() > 1) v.a[1] = js::Value::num(val); else v.a.push_back(js::Value::num(val)); }
    else v.set("score", js::Value::num(val));
}

inline double goldOf(const js::Value& data, const std::string& sid) {
    return data["gold"][sid]["amount"].n;
}
inline void setGold(js::Value& data, const std::string& sid, double val) {
    js::Value& g = data.o["gold"].o[sid];
    g.t = js::Value::OBJ;
    g.set("amount", js::Value::num(val));
}

inline void addLog(js::Value& data, const std::string& action, const std::string& sid,
                   const std::string& sname, double change, double current,
                   const std::string& reason, const std::string& page) {
    js::Value log = js::Value::obj()
        .set("timestamp", js::Value::str(ts()))
        .set("action", js::Value::str(action))
        .set("student_id", js::Value::str(sid))
        .set("student_name", js::Value::str(sname))
        .set("score_change", js::Value::num(change))
        .set("current_score", js::Value::num(current))
        .set("reason", js::Value::str(reason))
        .set("page", js::Value::str(page))
        .set("user_role", js::Value::str("cli"));
    if (!data["logs"].isArr()) data.o["logs"].t = js::Value::ARR;
    data.o["logs"].a.insert(data.o["logs"].a.begin(), log);   // 和网页一样 unshift

    // 日志太长会撑爆班级数据，留最近 2000 条
    while (data.o["logs"].a.size() > 2000) data.o["logs"].a.pop_back();
}

// ---------- 命令实现 ----------

inline int cmdClassInfo(const Client& c) {
    js::Value data = loadClassData(c);
    const js::Value& scores = data["scores"];
    int n = 0;
    double sum = 0, goldSum = 0;
    for (auto& kv : scores.o) {
        if (kv.first == "0") continue;
        ++n;
        sum += scoreOf(scores, kv.first);
        goldSum += goldOf(data, kv.first);
    }
    std::printf("班级: %s\n学生: %d 人\n分数合计: %.1f（均分 %.1f）\n金币合计: %.1f\n",
                c.cfg.classId.c_str(), n, sum, n ? sum / n : 0, goldSum);
    std::printf("分组: %zu 个 · 日志: %zu 条 · 作业系统: %s\n",
                data["groups"].o.size(), data["logs"].a.size(),
                data["homework_meta"].isObj() ? "已初始化" : "未初始化");
    std::printf("汇率: 1 学分 = %.4f 金币，1 金币 = %.4f 学分\n",
                data["exchangeRate"]["score_to_gold"].n, data["exchangeRate"]["gold_to_score"].n);
    return 0;
}

inline int cmdScore(const Client& c, int sid, double delta, const std::string& reason) {
    js::Value data = loadClassData(c);
    js::Value& scores = data.o["scores"];
    std::string s = std::to_string(sid);
    if (scores[s].t == js::Value::NUL) { std::printf("没有这个学号: %d\n", sid); return 1; }
    double oldV = scoreOf(scores, s);
    double newV = oldV + delta;
    setScore(scores, s, newV);
    addLog(data, "分数调整", s, nameOf(scores, s), delta, newV, reason, "score");
    saveClassData(c, data);
    std::printf("✓ 学号 %d %s · %.1f → %.1f (%+0.1f) %s\n", sid, nameOf(scores, s).c_str(), oldV, newV, delta,
                reason.empty() ? "" : reason.c_str());
    return 0;
}

inline int cmdScores(const Client& c, int top, bool showGold) {
    js::Value data = loadClassData(c);
    const js::Value& scores = data["scores"];
    std::vector<std::pair<int, std::tuple<std::string, double, double>>> rows;
    for (auto& kv : scores.o) {
        if (kv.first == "0") continue;
        int id = atoi(kv.first.c_str());
        rows.push_back({id, {nameOf(scores, kv.first), scoreOf(scores, kv.first), goldOf(data, kv.first)}});
    }
    std::sort(rows.begin(), rows.end(), [showGold](auto& a, auto& b) {
        return showGold ? std::get<2>(a.second) > std::get<2>(b.second) : std::get<1>(a.second) > std::get<1>(b.second);
    });
    std::printf("%-4s %-12s %8s %8s\n", "名次", "姓名", "分数", "金币");
    int i = 1;
    for (auto& r : rows) {
        if (top > 0 && i > top) break;
        std::printf("%-4d %-12s %8.1f %8.1f\n", i, std::get<0>(r.second).c_str(), std::get<1>(r.second), std::get<2>(r.second));
        ++i;
    }
    return 0;
}

inline int cmdGold(const Client& c, int sid, double delta, const std::string& reason) {
    js::Value data = loadClassData(c);
    std::string s = std::to_string(sid);
    if (data["scores"][s].t == js::Value::NUL) { std::printf("没有这个学号: %d\n", sid); return 1; }
    double oldV = goldOf(data, s);
    double newV = oldV + delta;
    if (newV < 0) newV = 0;
    setGold(data, s, newV);
    addLog(data, "金币调整", s, nameOf(data["scores"], s), delta, newV, reason, "gold");
    saveClassData(c, data);
    std::printf("✓ 学号 %d 金币 %.1f → %.1f (%+0.1f)\n", sid, oldV, newV, delta);
    return 0;
}

// 抽奖：网页规则是周五 12:00 之后开放，单抽 160 金币，十连 1600
inline int cmdGacha(const Client& c, int sid, int times) {
    js::Value data = loadClassData(c);
    std::string s = std::to_string(sid);
    if (data["scores"][s].t == js::Value::NUL) { std::printf("没有这个学号: %d\n", sid); return 1; }

    time_t t = time(nullptr);
    struct tm lt {};
    localtime_r(&t, &lt);
    if (lt.tm_wday != 5 || lt.tm_hour < 12) {
        std::printf("抽奖只在周五 12:00 之后开放（现在是 %d 时）。\n", lt.tm_hour);
        return 1;
    }

    const double cost = times >= 10 ? 1600 : 160;
    double gold = goldOf(data, s);
    if (gold < cost) {
        std::printf("金币不够：现有 %.1f，需要 %.0f\n", gold, cost);
        return 1;
    }

    // 奖励池：rewards 按稀有度分组，probability 作为权重；hidden_rewards 记为 SP
    std::vector<std::pair<int, js::Value>> pool;   // {权重, reward}
    const js::Value& rewards = data["rewards"];
    for (auto& kv : rewards.o) {
        if (kv.first == "hidden_rewards") continue;
        if (!kv.second.isArr()) continue;
        for (auto& r : kv.second.a) {
            int w = r["probability"].isNum() ? (int)r["probability"].n : 1;
            if (w < 1) w = 1;
            js::Value copy = r;
            copy.t = js::Value::OBJ;
            copy.set("rarity", js::Value::str(kv.first));
            pool.push_back({w, copy});
        }
    }
    for (auto& r : rewards["hidden_rewards"].a) {
        int w = r["probability"].isNum() ? (int)r["probability"].n : 1;
        if (w < 1) w = 1;
        js::Value copy = r;
        copy.t = js::Value::OBJ;
        copy.set("rarity", js::Value::str("SP"));
        pool.push_back({w, copy});
    }

    std::random_device rd;
    std::mt19937 gen(rd());
    int totalW = 0;
    for (auto& p : pool) totalW += p.first;

    int draws = times >= 10 ? 10 : 1;
    double score = scoreOf(data["scores"], s);
    std::printf("🎰 学号 %d 抽 %d 次，消耗 %.0f 金币\n", sid, draws, cost);

    for (int i = 0; i < draws; ++i) {
        js::Value reward;
        if (pool.empty() || totalW <= 0) {
            reward = js::Value::obj()
                .set("name", js::Value::str("谢谢参与"))
                .set("type", js::Value::str("虚拟"))
                .set("description", js::Value::str("下次好运！"))
                .set("rarity", js::Value::str("N"));
        } else {
            int pick = (int)(gen() % totalW);
            for (auto& p : pool) {
                pick -= p.first;
                if (pick < 0) { reward = p.second; break; }
            }
        }
        double gain = reward["score"].n;
        if (gain != 0) { score += gain; setScore(data.o["scores"], s, score); }
        std::printf("  [%s] %s %s%s\n",
                    reward["rarity"].asStr().c_str(),
                    reward["name"].asStr().c_str(),
                    gain != 0 ? ("+" + reward["score"].fmtNum() + " 学分").c_str() : "",
                    reward["description"].asStr().empty() ? "" : (" · " + reward["description"].asStr()).c_str());
        addLog(data, draws > 1 ? "十连抽获得" : "抽奖获得", s, nameOf(data["scores"], s),
               gain, score, "获得: " + reward["name"].asStr(), "gacha");
    }

    double goldAfter = gold - cost;
    setGold(data, s, goldAfter);
    addLog(data, draws > 1 ? "十连抽消耗" : "抽奖消耗", s, nameOf(data["scores"], s),
           -cost, goldAfter, std::to_string(draws) + " 次", "gacha");
    saveClassData(c, data);
    std::printf("金币: %.1f → %.1f，学分: %.1f\n", gold, goldAfter, score);
    return 0;
}

inline int cmdJournal(const Client& c, int sid) {
    js::Value v = c.get("/api/class/" + c.cfg.classId + "/journal/" + std::to_string(sid), false);
    std::string body = v["journal"].asStr();
    if (body.empty()) std::printf("（学号 %d 还没有历程记录）\n", sid);
    else std::printf("%s", body.c_str());
    return 0;
}

inline int cmdJournalAdd(const Client& c, int sid, const std::string& content, const std::string& operatorName) {
    js::Value body = js::Value::obj()
        .set("student_id", js::Value::str(std::to_string(sid)))
        .set("content", js::Value::str(content));
    if (!operatorName.empty()) {
        body.set("operator_name", js::Value::str(operatorName));
        body.set("operator_role", js::Value::str("admin"));
    }
    c.post("/api/class/" + c.cfg.classId + "/journal", body, false);
    std::printf("✓ 已追加到学号 %d 的历程\n", sid);
    return 0;
}

inline int cmdJournalExport(const Client& c) {
    js::Value roster = c.students();
    std::string ids, names;
    for (auto& kv : roster["students"].o) {
        if (!ids.empty()) { ids += ","; names += ","; }
        ids += kv.first;
        names += kv.second.asStr();
    }
    auto r = http::request("GET",
        c.cfg.server + "/api/class/" + c.cfg.classId + "/journal-export?ids=" + ids + "&names=" + names,
        {{"Accept", "text/plain"}});
    if (!r.ok()) { std::printf("导出失败: HTTP %ld\n", r.code); return 1; }
    std::printf("%s", r.body.c_str());
    return 0;
}

inline int cmdLogs(const Client& c, int n) {
    js::Value data = loadClassData(c);
    const js::Value& logs = data["logs"];
    int i = 0;
    std::printf("%-20s %-10s %-8s %8s %8s  %s\n", "时间", "动作", "学号", "变化", "当前", "备注");
    for (auto& l : logs.a) {
        if (n > 0 && i >= n) break;
        std::printf("%-20s %-10s %-8s %8.1f %8.1f  %s\n",
                    l["timestamp"].asStr().c_str(), l["action"].asStr().c_str(),
                    l["student_id"].asStr().c_str(), l["score_change"].n, l["current_score"].n,
                    l["reason"].asStr().c_str());
        ++i;
    }
    if (i == 0) std::printf("（暂无日志）\n");
    return 0;
}

inline int cmdGroups(const Client& c) {
    js::Value data = loadClassData(c);
    const js::Value& groups = data["groups"];
    if (!groups.isObj() || groups.o.empty()) { std::printf("（还没有分组）\n"); return 0; }
    for (auto& kv : groups.o) {
        double sum = 0;
        int cnt = 0;
        std::printf("▸ %s（%zu 人）\n", kv.first.c_str(), kv.second.a.size());
        for (auto& m : kv.second.a) {
            std::string sid = m.asStr();
            if (sid == "0") continue;
            double sc = scoreOf(data["scores"], sid);
            sum += sc; ++cnt;
            std::printf("     %-4s %-12s %6.1f\n", sid.c_str(), nameOf(data["scores"], sid).c_str(), sc);
        }
        std::printf("     组均分 %.1f\n", cnt ? sum / cnt : 0);
    }
    return 0;
}

inline int cmdTypes(const Client& c) {
    js::Value meta = c.meta();
    const js::Value& types = meta["types"];
    if (!types.isObj() || types.o.empty()) {
        std::printf("（这个班没配作业种类，所有科目按\"整科已交\"计）\n");
        return 0;
    }
    for (auto& kv : types.o) {
        std::printf("科目 %-3s:", kv.first.c_str());
        int i = 0;
        for (auto& t : kv.second.a) std::printf(" %d=%s", i++, t.asStr().c_str());
        std::printf("\n");
    }
    return 0;
}

// 作业初始化：学生数 + 科目名（逗号分隔）；可选 --start YYYY-MM-DD
inline int cmdInit(const Client& c, int students, const std::vector<std::string>& subjects, const std::string& start) {
    js::Value names = js::Value::obj();
    for (size_t i = 0; i < subjects.size(); ++i) {
        names.set(std::to_string(i), js::Value::str(subjects[i]));
    }
    js::Value body = js::Value::obj()
        .set("student_count", js::Value::num(students))
        .set("subject_count", js::Value::num((double)subjects.size()))
        .set("subject_names", names);
    if (subjects.empty()) { std::printf("至少要有一个科目\n"); return 1; }
    if (!start.empty()) body.set("start_date", js::Value::str(start));

    js::Value r = c.post("/api/class/" + c.cfg.classId + "/homework/init", body, true);
    std::printf("✓ 初始化成功：%d 人 × %zu 科\n", students, subjects.size());
    if (!r["message"].asStr().empty()) std::printf("  %s\n", r["message"].asStr().c_str());
    return 0;
}

// 绑卡：/uuids/add
inline int cmdBindUid(const Client& c, const std::string& uid, int sid, int subject, int type, const std::string& date) {
    js::Value body = js::Value::obj()
        .set("uid", js::Value::str(uid))
        .set("student_id", js::Value::num(sid));
    if (subject >= 0) body.set("subject_id", js::Value::num(subject));
    if (type >= 0) body.set("type_id", js::Value::num(type));
    if (!date.empty()) body.set("target_date", js::Value::str(date));
    js::Value r = c.post("/api/class/" + c.cfg.classId + "/uuids/add", body, true);
    std::printf("✓ 已绑定 %s → 学号 %d%s\n", uid.c_str(), sid,
                r["message"].asStr().empty() ? "" : (" · " + r["message"].asStr()).c_str());
    return 0;
}

// 查看全班 UID 字典
inline std::string uidHex(const js::Value& bytes) {
    std::string out;
    for (auto& b : bytes.a) {
        if (!out.empty()) out += ":";
        char buf[4];
        snprintf(buf, sizeof buf, "%02X", (int)b.n);
        out += buf;
    }
    return out;
}

inline int cmdUids(const Client& c) {
    js::Value v = c.get("/api/class/" + c.cfg.classId + "/uuids", true);
    js::Value data = loadClassData(c);
    const js::Value& map = v["uuids"];
    if (!map.isObj() || map.o.empty()) { std::printf("（还没有绑定任何卡）\n"); return 0; }
    for (auto& kv : map.o) std::printf("%-4s %-12s %s\n", kv.first.c_str(),
                                       nameOf(data["scores"], kv.first).c_str(),
                                       uidHex(kv.second).c_str());
    return 0;
}

// ---------- 职位 / 考试 / 每日汇报 / 备份 / 账号 ----------

inline int cmdPositions(const Client& c) {
    js::Value data = loadClassData(c);
    const js::Value& pos = data["positions"]["list"];
    if (!pos.isObj() || pos.o.empty()) { std::printf("（还没有职位）\n"); return 0; }
    std::printf("默认月薪: %.0f\n", data["positions"]["defaultSalary"].n);
    for (auto& kv : pos.o) {
        std::printf("\n👔 %s  月薪 %.0f\n", kv.first.c_str(), kv.second["salary"].n);
        std::printf("   成员: ");
        if (kv.second["members"].a.empty()) std::printf("（空缺）");
        for (auto& m : kv.second["members"].a) std::printf("%s ", m.asStr().c_str());
        std::printf("\n");
    }
    std::printf("\n上次发薪: %s\n", data["positions"]["lastPayDate"].asStr().empty()
        ? "从未" : data["positions"]["lastPayDate"].asStr().c_str());
    return 0;
}

inline int cmdPositionAdd(const Client& c, const std::string& name, double salary) {
    js::Value data = loadClassData(c);
    if (data["positions"].t == js::Value::NUL) {
        data.set("positions", js::Value::obj()
                    .set("list", js::Value::obj())
                    .set("defaultSalary", js::Value::num(5))
                    .set("lastPayDate", js::Value::str("")));
    }
    js::Value list = data["positions"]["list"];
    if (!list.isObj()) list = js::Value::obj();
    list.set(name, js::Value::obj().set("salary", js::Value::num(salary)).set("members", js::Value::arr()));
    js::Value positions = data["positions"];
    positions.set("list", list);
    data.set("positions", positions);
    saveClassData(c, data);
    std::printf("✓ 已添加职位「%s」，月薪 %.0f\n", name.c_str(), salary);
    return 0;
}

inline int cmdPositionJoin(const Client& c, const std::string& name, int sid) {
    js::Value data = loadClassData(c);
    std::string s = std::to_string(sid);
    if (data["scores"][s].t == js::Value::NUL) { std::printf("没有这个学号: %d\n", sid); return 1; }
    js::Value list = data["positions"]["list"];
    if (!list.isObj() || list[name].t == js::Value::NUL) { std::printf("没有这个职位: %s\n", name.c_str()); return 1; }
    js::Value members = list[name]["members"];
    if (!members.isArr()) members = js::Value::arr();
    bool exists = false;
    for (auto& m : members.a) if (m.asStr() == s) exists = true;
    if (!exists) members.push(js::Value::str(s));
    js::Value item = js::Value::obj().set("salary", list[name]["salary"]).set("members", members);
    list.set(name, item);
    js::Value positions = data["positions"];
    positions.set("list", list);
    data.set("positions", positions);
    saveClassData(c, data);
    std::printf(exists ? "✓ %d 已经在「%s」里了\n" : "✓ 已把 %d 登记到「%s」\n", sid, name.c_str());
    return 0;
}

inline int cmdPositionPay(const Client& c) {
    js::Value data = loadClassData(c);
    const js::Value& list = data["positions"]["list"];
    if (!list.isObj() || list.o.empty()) { std::printf("（还没有职位）\n"); return 1; }
    js::Value gold = data["gold"];
    if (!gold.isObj()) gold = js::Value::obj();
    double total = 0;
    int people = 0;
    for (auto& kv : list.o) {
        double salary = kv.second["salary"].n;
        for (auto& m : kv.second["members"].a) {
            std::string sid = m.asStr();
            js::Value entry = gold[sid];
            double cur = entry["amount"].n;
            gold.set(sid, js::Value::obj().set("amount", js::Value::num(cur + salary)));
            total += salary;
            ++people;
            std::printf("  %s ← +%.0f（%s）\n", sid.c_str(), salary, kv.first.c_str());
        }
    }
    js::Value positions = data["positions"];
    positions.set("lastPayDate", js::Value::str(ts().substr(0, 10)));
    data.set("positions", positions);
    data.set("gold", gold);
    saveClassData(c, data);
    std::printf("✓ 发放 %d 人次，共 %.0f 金币\n", people, total);
    return 0;
}

inline int cmdExam(const Client& c, const std::string& sid) {
    js::Value data = loadClassData(c);
    const js::Value& exams = data["examScores"];
    if (!exams.isObj() || exams.o.empty()) { std::printf("（还没有考试记录）\n"); return 0; }
    for (auto& kv : exams.o) {
        if (!sid.empty() && kv.first != sid) continue;
        std::printf("\n学号 %s · %s\n", kv.first.c_str(), nameOf(data["scores"], kv.first).c_str());
        for (auto& e : kv.second.a) {
            std::printf("  %s  %-8s %-14s %6.1f / %.0f  (%.0f%%)\n",
                        e["date"].asStr().c_str(), e["subject"].asStr().c_str(), e["name"].asStr().c_str(),
                        e["score"].n, e["full"].n, e["full"].n > 0 ? e["score"].n / e["full"].n * 100 : 0.0);
        }
    }
    return 0;
}

inline int cmdExamAdd(const Client& c, int sid, const std::string& subject, const std::string& name,
                      double score, double full, const std::string& date) {
    js::Value data = loadClassData(c);
    std::string s = std::to_string(sid);
    if (data["scores"][s].t == js::Value::NUL) { std::printf("没有这个学号: %d\n", sid); return 1; }
    js::Value exams = data["examScores"];
    if (!exams.isObj()) exams = js::Value::obj();
    js::Value arr = exams[s];
    if (!arr.isArr()) arr = js::Value::arr();
    arr.push(js::Value::obj()
                 .set("id", js::Value::str(std::to_string(time(nullptr))))
                 .set("date", js::Value::str(date))
                 .set("name", js::Value::str(name))
                 .set("subject", js::Value::str(subject))
                 .set("score", js::Value::num(score))
                 .set("full", js::Value::num(full)));
    exams.set(s, arr);
    data.set("examScores", exams);
    saveClassData(c, data);
    std::printf("✓ 已录入 %d 的 %s %s：%.1f/%.0f\n", sid, subject.c_str(), name.c_str(), score, full);
    return 0;
}

inline int cmdReport(const Client& c) {
    js::Value data = loadClassData(c);
    std::string today = ts().substr(0, 10);
    std::string key;
    for (char ch : today) key += (ch == '/') ? '-' : ch;
    const js::Value& dr = data["dailyReport"][key];
    std::printf("每日汇报 · %s\n", key.c_str());
    if (dr.t == js::Value::NUL) std::printf("  今日还没有汇报记录\n");
    else std::printf("  状态: %s    最后汇报: %s\n",
                     dr["allReported"].asBool() ? "✅ 已全部汇报" : "⭕ 未完成",
                     dr["lastReportTime"].asStr().empty() ? "-" : dr["lastReportTime"].asStr().c_str());
    const js::Value& scores = data["scores"];
    int n = 0; double sum = 0;
    for (auto& kv : scores.o) { if (kv.first == "0") continue; ++n; sum += scoreOf(scores, kv.first); }
    std::printf("  全班 %d 人，平均分 %.1f\n", n, n > 0 ? sum / n : 0);
    return 0;
}

inline int cmdBackup(const Client& c, const std::string& path) {
    js::Value data = loadClassData(c);
    FILE* f = std::fopen(path.c_str(), "w");
    if (!f) { std::printf("写不了 %s\n", path.c_str()); return 1; }
    std::string json = data.dump();
    std::fwrite(json.data(), 1, json.size(), f);
    std::fclose(f);
    std::printf("✓ 已导出班级数据 %zu 字节 → %s\n", json.size(), path.c_str());
    return 0;
}

inline int cmdAccount(const Client& c) {
    std::printf("服务器: %s\n班级: %s\n密码: %s\n", c.cfg.server.c_str(), c.cfg.classId.c_str(),
                c.cfg.password.empty() ? "（未设置）" : "（已设置）");
    js::Value classes = c.get("/api/classes", false);
    for (auto& k : classes.a) {
        if (k["id"].asStr() == c.cfg.classId) std::printf("班级名称: %s\n", k["name"].asStr().c_str());
    }
    return 0;
}

} // namespace extra
