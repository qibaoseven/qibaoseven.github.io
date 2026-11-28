import SwiftUI

/// 网页端的「控制台 / 分数 / 金币 / 抽奖 / 历程 / 日志 / 分组 / 初始化」
/// 五个平台（iOS / macOS / tvOS / watchOS / visionOS）共用这一份实现。
///
/// 数据流和网页一致：GET 班级数据 → 本地改 → POST 整包覆盖。

struct ApiConfig {
    var server: String
    var classId: String
    var password: String
}

@MainActor
final class MoreStore: ObservableObject {
    @Published var data: [String: Any] = [:]
    @Published var meta: [String: Any] = [:]
    @Published var loading = false
    @Published var message: String?
    var cfg: ApiConfig

    init(cfg: ApiConfig) { self.cfg = cfg }

    func load() async {
        let a = ApiClient()
        await a.configure(cfg.server, cfg.classId, cfg.password)
        loading = true; defer { loading = false }
        do {
            data = try await a.classData()
            meta = try await a.meta()
            message = nil
        } catch { message = error.localizedDescription }
    }

    // MARK: 分数 / 金币

    func adjust(sid: String, score: Double?, gold: Double?, reason: String, name: String) async {
        var d = data
        guard var scores = d["scores"] as? [String: Any], var row = scores[sid] else {
            message = "没有学号 \(sid)"; return
        }
        var newScore = 0.0
        var newGold = 0.0
        if let score {
            if let arr = row as? [Any], arr.count > 1 {
                var a = arr
                let old = (a[1] as? NSNumber)?.doubleValue ?? 0
                newScore = old + score
                a[1] = newScore
                row = a
                message = "✓ \(name) 分数 \(old) → \(newScore)"
            } else if var obj = row as? [String: Any] {
                let old = (obj["score"] as? NSNumber)?.doubleValue ?? 0
                newScore = old + score
                obj["score"] = newScore
                row = obj
                message = "✓ \(name) 分数 \(old) → \(newScore)"
            }
            scores[sid] = row
            d["scores"] = scores
        }
        var golds = d["gold"] as? [String: Any] ?? [:]
        var entry = golds[sid] as? [String: Any] ?? ["amount": 0.0]
        let oldGold = (entry["amount"] as? NSNumber)?.doubleValue ?? 0
        if let gold {
            newGold = max(0, oldGold + gold)
            entry["amount"] = newGold
            golds[sid] = entry
            d["gold"] = golds
            message = "✓ \(name) 金币 \(oldGold) → \(newGold)"
        }
        appendLog(&d, action: score != nil ? "分数调整" : "金币调整", sid: sid, name: name,
                  change: score ?? gold ?? 0, current: score != nil ? newScore : newGold, reason: reason)
        await save(d)
    }


    // MARK: 分组 / 每日汇报

    func groupEdit(name: String, sid: String, op: String) async {
        let g = name.trimmingCharacters(in: .whitespaces)
        if g.isEmpty { message = "先填分组名"; return }
        var d = data
        var groups = d["groups"] as? [String: Any] ?? [:]
        switch op {
        case "create":
            if groups[g] != nil { message = "分组已存在：\(g)"; return }
            groups[g] = [Any]()
        case "delete":
            guard groups[g] != nil else { message = "没有这个分组：\(g)"; return }
            groups.removeValue(forKey: g)
        default:
            guard let mem = groups[g] as? [Any] else { message = "没有这个分组：\(g)"; return }
            var ids = mem.map { "\($0)" }
            if op == "add" { if !ids.contains(sid) { ids.append(sid) } }
            else { ids.removeAll { $0 == sid } }
            groups[g] = ids as [Any]
        }
        d["groups"] = groups
        message = "✓ 分组「\(g)」已更新"
        await save(d)
    }

    func reportWrite(op: String) async {
        var d = data
        var dr = d["dailyReport"] as? [String: Any] ?? [:]
        let today = todayText()
        if op == "reset" {
            dr.removeValue(forKey: today)
            message = "✓ 已重置今日汇报"
        } else {
            let f = DateFormatter(); f.dateFormat = "HH:mm:ss"
            dr[today] = ["allReported": true, "lastReportTime": f.string(from: Date())]
            message = "✓ 已标记全班已汇报"
        }
        d["dailyReport"] = dr
        await save(d)
    }

    func reportBatch(delta: Double, reason: String) async {
        if delta == 0 { message = "加减值不能为 0"; return }
        var d = data
        guard let scores = d["scores"] as? [String: Any] else { message = "班级没有 scores"; return }
        var newScores = scores
        var n = 0
        for (sid, value) in scores {
            if sid == "0" { continue }
            var name = "学号\(sid)"
            var ns = 0.0
            if var arr = value as? [Any], arr.count > 1 {
                name = arr[0] as? String ?? name
                let old = (arr[1] as? NSNumber)?.doubleValue ?? 0
                ns = old + delta
                arr[1] = ns
                newScores[sid] = arr
            } else if var obj = value as? [String: Any] {
                name = obj["name"] as? String ?? name
                let old = (obj["score"] as? NSNumber)?.doubleValue ?? 0
                ns = old + delta
                obj["score"] = ns
                newScores[sid] = obj
            }
            appendLog(&d, action: "每日汇报批量加分", sid: sid, name: name,
                      change: delta, current: ns, reason: reason.isEmpty ? "每日汇报" : reason)
            n += 1
        }
        d["scores"] = newScores
        var dr = d["dailyReport"] as? [String: Any] ?? [:]
        let f = DateFormatter(); f.dateFormat = "HH:mm:ss"
        dr[todayText()] = ["allReported": true, "lastReportTime": f.string(from: Date())]
        d["dailyReport"] = dr
        message = "✓ 已对 \(n) 人批量 \(delta > 0 ? "+" : "")\(delta)"
        await save(d)
    }

    private func appendLog(_ d: inout [String: Any], action: String, sid: String, name: String,
                           change: Double, current: Double, reason: String) {
        let f = DateFormatter(); f.dateFormat = "yyyy/MM/dd HH:mm:ss"
        var logs = d["logs"] as? [[String: Any]] ?? []
        logs.insert(["timestamp": f.string(from: Date()), "action": action, "student_id": sid,
                     "student_name": name, "score_change": change, "current_score": current,
                     "reason": reason, "page": "swift", "user_role": "teacher"], at: 0)
        if logs.count > 2000 { logs = Array(logs.prefix(2000)) }
        d["logs"] = logs
    }

    private func save(_ d: [String: Any]) async {
        let a = ApiClient()
        await a.configure(cfg.server, cfg.classId, cfg.password)
        loading = true; defer { loading = false }
        do {
            try await a.saveClassData(d)
            data = d
        } catch {
            message = "保存失败: \(error.localizedDescription)"
        }
    }

    // MARK: 抽奖

    func gacha(sid: String, times: Int) async {
        let cal = Calendar.current
        let now = Date()
        let weekday = cal.component(.weekday, from: now)   // 6 = 周五
        let hour = cal.component(.hour, from: now)
        guard weekday == 6, hour >= 12 else { message = "抽奖只在周五 12:00 之后开放"; return }

        let cost = times >= 10 ? 1600.0 : 160.0
        var d = data
        var golds = d["gold"] as? [String: Any] ?? [:]
        var entry = golds[sid] as? [String: Any] ?? ["amount": 0.0]
        let have = (entry["amount"] as? NSNumber)?.doubleValue ?? 0
        guard have >= cost else { message = "金币不够：现有 \(have)，需要 \(cost)"; return }

        // 奖励池：rewards 里按稀有度分组，probability 作为权重；hidden_rewards 记 SP
        var pool: [(Int, [String: Any])] = []
        if let rewards = d["rewards"] as? [String: Any] {
            for (rarity, v) in rewards where rarity != "hidden_rewards" {
                if let arr = v as? [[String: Any]] {
                    for var r in arr {
                        let w = max((r["probability"] as? NSNumber)?.intValue ?? 1, 1)
                        r["rarity"] = rarity
                        pool.append((w, r))
                    }
                }
            }
            if let arr = rewards["hidden_rewards"] as? [[String: Any]] {
                for var r in arr {
                    let w = max((r["probability"] as? NSNumber)?.intValue ?? 1, 1)
                    r["rarity"] = "SP"
                    pool.append((w, r))
                }
            }
        }
        let total = pool.reduce(0) { $0 + $1.0 }
        var scores = d["scores"] as? [String: Any] ?? [:]
        var row = scores[sid] as? [Any] ?? []
        var name = "学号\(sid)"
        var score = 0.0
        if row.count > 1 {
            name = row[0] as? String ?? name
            score = (row[1] as? NSNumber)?.doubleValue ?? 0
        }
        var lines: [String] = []
        for _ in 0..<(times >= 10 ? 10 : 1) {
            var pick: [String: Any] = ["name": "谢谢参与", "rarity": "N"]
            if total > 0 {
                var v = Int.random(in: 0..<total)
                for p in pool { v -= p.0; if v < 0 { pick = p.1; break } }
            }
            let gain = (pick["score"] as? NSNumber)?.doubleValue ?? 0
            score += gain
            let r = pick["rarity"] as? String ?? "N"
            lines.append("[\(r)] \(pick["name"] as? String ?? "谢谢参与")" + (gain != 0 ? " +\(gain) 学分" : ""))
        }
        if row.count > 1 { row[1] = score; scores[sid] = row; d["scores"] = scores }
        entry["amount"] = have - cost; golds[sid] = entry; d["gold"] = golds
        appendLog(&d, action: times >= 10 ? "十连抽消耗" : "抽奖消耗", sid: sid, name: name,
                  change: -cost, current: have - cost, reason: "\(times) 次")
        await save(d)
        message = lines.joined(separator: "\n") + "\n金币 \(have) → \(have - cost)·学分 \(score)"
    }

    func paySalaries() async {
        var d = data
        guard let pos = d["positions"] as? [String: Any],
              let list = pos["list"] as? [String: Any], !list.isEmpty else { message = "（还没有职位）"; return }
        var golds = d["gold"] as? [String: Any] ?? [:]
        var total = 0.0, people = 0
        for (_, v) in list {
            guard let item = v as? [String: Any] else { continue }
            let salary = (item["salary"] as? NSNumber)?.doubleValue ?? 0
            for m in (item["members"] as? [Any]) ?? [] {
                let sid = "\(m)"
                var e = golds[sid] as? [String: Any] ?? ["amount": 0.0]
                e["amount"] = ((e["amount"] as? NSNumber)?.doubleValue ?? 0) + salary
                golds[sid] = e
                total += salary; people += 1
            }
        }
        d["gold"] = golds
        var p2 = pos
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        p2["lastPayDate"] = f.string(from: Date())
        d["positions"] = p2
        await save(d)
        message = "✓ 发放 \(people) 人次，共 \(total) 金币"
    }

    // MARK: 自动事件

    func runAutoEvents() async {
        var d = data
        guard var events = d["autoEvents"] as? [[String: Any]], !events.isEmpty else {
            message = "（还没有自动事件）"; return
        }
        let cal = Calendar.current
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"
        let today = df.string(from: Date())
        var scores = d["scores"] as? [String: Any] ?? [:]
        let groups = d["groups"] as? [String: Any] ?? [:]
        var applied = 0

        for i in events.indices {
            let e = events[i]
            let freq = e["frequency"] as? String ?? "daily"
            var due = false
            switch freq {
            case "weekly":  due = (cal.component(.weekday, from: Date()) - 1) == (e["dayOfWeek"] as? Int ?? 1)
            case "monthly": due = cal.component(.day, from: Date()) == (e["dayOfMonth"] as? Int ?? 1)
            default:        due = true
            }
            if !due { continue }
            var lastRun = e["lastRun"] as? [String: Any] ?? [:]
            if lastRun[today] as? Bool == true { continue }

            var ids: [String] = []
            for t in (e["targets"] as? [Any]) ?? [] {
                let target = "\(t)"
                if target == "all" {
                    ids += scores.keys.filter { $0 != "0" }
                } else if target.hasPrefix("group:") {
                    ids += (groups[String(target.dropFirst(6))] as? [Any])?.map { "\($0)" } ?? []
                } else {
                    ids.append(target)
                }
            }
            let change = (e["change"] as? NSNumber)?.doubleValue ?? 0
            for sid in Set(ids) where sid != "0" {
                guard var row = scores[sid] else { continue }
                var name = "学号\(sid)"; var old = 0.0
                if var arr = row as? [Any], arr.count > 1 {
                    name = arr[0] as? String ?? name
                    old = (arr[1] as? NSNumber)?.doubleValue ?? 0
                    arr[1] = old + change
                    row = arr
                } else if var o = row as? [String: Any] {
                    name = o["name"] as? String ?? name
                    old = (o["score"] as? NSNumber)?.doubleValue ?? 0
                    o["score"] = old + change
                    row = o
                }
                scores[sid] = row
                appendLog(&d, action: "自动事件", sid: sid, name: name,
                          change: change, current: old + change,
                          reason: e["reason"] as? String ?? "自动事件")
                applied += 1
            }
            lastRun[today] = true
            events[i]["lastRun"] = lastRun
        }
        d["scores"] = scores
        d["autoEvents"] = events
        await save(d)
        message = "✓ 执行完成：改动 \(applied) 人次"
    }

    func addAutoEvent(name: String, freqSpec: String, targets: String, change: Double, reason: String) async {
        var d = data
        var events = d["autoEvents"] as? [[String: Any]] ?? []
        let parts = freqSpec.split(separator: ":").map(String.init)
        var e: [String: Any] = [
            "name": name,
            "frequency": parts.first ?? "daily",
            "change": change,
            "reason": reason.isEmpty ? "自动事件" : reason,
            "lastRun": [String: Any](),
            "targets": targets.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
        ]
        if parts.first == "weekly" { e["dayOfWeek"] = Int(parts.count > 1 ? parts[1] : "1") ?? 1 }
        if parts.first == "monthly" { e["dayOfMonth"] = Int(parts.count > 1 ? parts[1] : "1") ?? 1 }
        events.append(e)
        d["autoEvents"] = events
        await save(d)
        message = "✓ 已添加「\(name)」"
    }

    func initHomework(students: Int, subjects: [String]) async {
        let a = ApiClient()
        await a.configure(cfg.server, cfg.classId, cfg.password)
        loading = true; defer { loading = false }
        do {
            try await a.initHomework(students: students, subjects: subjects)
            message = "✓ 初始化 \(students) 人 × \(subjects.count) 科"
            await load()
        } catch { message = "初始化失败: \(error.localizedDescription)" }
    }

    func journal(sid: Int) async -> String {
        let a = ApiClient()
        await a.configure(cfg.server, cfg.classId, cfg.password)
        return (try? await a.journal(studentId: sid)) ?? ""
    }

    func journalAdd(sid: Int, text: String) async {
        let a = ApiClient()
        await a.configure(cfg.server, cfg.classId, cfg.password)
        do { try await a.journalAdd(studentId: sid, text: text, operatorName: nil); message = "已追加" }
        catch { message = "追加失败: \(error.localizedDescription)" }
    }
}

// MARK: - 数据整形

struct ScoreRow: Identifiable {
    let id: String; let name: String; let score: Double; let gold: Double
}

func scoreRows(_ data: [String: Any]) -> [ScoreRow] {
    let scores = data["scores"] as? [String: Any] ?? [:]
    let golds = data["gold"] as? [String: Any] ?? [:]
    var out: [ScoreRow] = []
    for (sid, v) in scores where sid != "0" {
        var name = "学号\(sid)"; var score = 0.0
        if let arr = v as? [Any], arr.count > 1 {
            name = arr[0] as? String ?? name
            score = (arr[1] as? NSNumber)?.doubleValue ?? 0
        } else if let o = v as? [String: Any] {
            name = o["name"] as? String ?? name
            score = (o["score"] as? NSNumber)?.doubleValue ?? 0
        }
        let g = ((golds[sid] as? [String: Any])?["amount"] as? NSNumber)?.doubleValue ?? 0
        out.append(ScoreRow(id: sid, name: name, score: score, gold: g))
    }
    return out.sorted { $0.score > $1.score }
}

// MARK: - 界面

struct MoreView: View {
    let model: AppModel
    @StateObject private var store: MoreStore
    @State private var section: String?

    init(model: AppModel) {
        self.model = model
        _store = StateObject(wrappedValue: MoreStore(cfg: ApiConfig(server: model.server, classId: model.classId, password: model.password)))
    }

    private let entries: [(String, String)] = [
        ("scores", "📊 分数榜 / 加减分"),
        ("gold", "💰 金币 / 🎰 抽奖"),
        ("journal", "📖 学生历程"),
        ("logs", "📋 操作日志"),
        ("groups", "👥 分组"),
        ("init", "📚 作业初始化 / 种类"),
        ("positions", "👔 职位 / 工资"),
        ("exam", "📝 考试分数"),
        ("report", "📋 每日汇报"),
        ("backup", "💾 数据备份"),
        ("account", "🔑 账号 / 连接"),
        ("autoEvents", "⚡ 自动事件"),
    ]

    var body: some View {
        NavigationStack {
            List {
                if let m = store.message {
                    Text(m).font(.caption).foregroundStyle(.secondary)
                }
                ForEach(entries.indices, id: \.self) { i in
                    NavigationLink(entries[i].1) { destination(entries[i].0) }
                        .task { if store.data.isEmpty { await store.load() } }
                }
            }
            .navigationTitle("更多功能")
            .refreshable { await store.load() }
        }
        .task { if store.data.isEmpty { await store.load() } }
    }

    @ViewBuilder
    private func destination(_ key: String) -> some View {
        switch key {
        case "scores": ScorePage(store: store)
        case "gold": GoldPage(store: store)
        case "journal": JournalPage(store: store, roster: model.roster?.sorted ?? [])
        case "logs": LogsPage(store: store)
        case "groups": GroupsPage(store: store)
        case "positions": PositionsPage(store: store)
        case "exam": ExamPage(store: store)
        case "report": ReportPage(store: store)
        case "backup": BackupPage(store: store)
        case "account": AccountPage(model: model)
        case "autoEvents": AutoEventsPage(store: store)
        default: InitPage(store: store)
        }
    }
}

// MARK: - 分数

struct ScorePage: View {
    @ObservedObject var store: MoreStore
    @State private var delta = "+2"
    @State private var reason = ""
    @State private var selected: ScoreRow?

    var body: some View {
        List {
            Section("分数榜（点一下改分或改金币）") {
                ForEach(scoreRows(store.data)) { row in
                    Button {
                        selected = row
                    } label: {
                        HStack {
                            Text(row.name)
                            Spacer()
                            Text(String(format: "%.1f", row.score)).bold()
                            Text("💰\(Int(row.gold))").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section("调整") {
                TextField("变化，例如 +2 或 -1", text: $delta)
                TextField("原因（写入操作日志）", text: $reason)
                if let row = selected {
                    Text("选中：\(row.id) \(row.name)").font(.caption)
                    Button("提交分数调整") {
                        Task {
                            await store.adjust(sid: row.id, score: Double(delta) ?? 0, gold: nil, reason: reason, name: row.name)
                            selected = nil
                        }
                    }
                    Button("改为金币调整") {
                        Task {
                            await store.adjust(sid: row.id, score: nil, gold: Double(delta) ?? 0, reason: reason, name: row.name)
                            selected = nil
                        }
                    }
                }
            }
            if let m = store.message { Section { Text(m).font(.caption) } }
        }
        .navigationTitle("分数")
    }
}

// MARK: - 金币 / 抽奖

struct GoldPage: View {
    @ObservedObject var store: MoreStore
    @State private var sid = ""
    @State private var delta = "+50"

    var body: some View {
        List {
            Section("金币榜") {
                ForEach(scoreRows(store.data).sorted { $0.gold > $1.gold }.prefix(20)) { row in
                    HStack {
                        Text(row.name); Spacer()
                        Text(String(format: "%.0f", row.gold)).bold()
                    }
                }
            }
            Section("改金币") {
                TextField("学号", text: $sid)
                TextField("变化，例如 +50", text: $delta)
                Button("提交") {
                    let name = scoreRows(store.data).first { $0.id == sid }?.name ?? "学号\(sid)"
                    Task { await store.adjust(sid: sid, score: nil, gold: Double(delta) ?? 0, reason: "手动调整", name: name) }
                }
            }
            Section("抽奖 · 周五 12:00 后 · 单抽 160 / 十连 1600") {
                Button("单抽") { Task { await store.gacha(sid: sid, times: 1) } }
                Button("十连") { Task { await store.gacha(sid: sid, times: 10) } }
            }
            if let m = store.message { Section { Text(m).font(.caption) } }
        }
        .navigationTitle("金币 · 抽奖")
    }
}

// MARK: - 学生历程

struct JournalPage: View {
    @ObservedObject var store: MoreStore
    let roster: [(id: Int, name: String)]
    @State private var selected: Int = 0
    @State private var content = ""
    @State private var text = ""

    var body: some View {
        List {
            Section("选学生") {
                Picker("学生", selection: $selected) {
                    ForEach(roster, id: \.id) { s in Text("\(s.id) \(s.name)").tag(s.id) }
                }
                .onChange(of: selected) { newValue in
                    Task { content = await store.journal(sid: newValue) }
                }
                Button("读取历程") { Task { content = await store.journal(sid: selected) } }
            }
            Section("内容") {
                Text(content.isEmpty ? "（还没有历程记录）" : content).font(.caption)
            }
            Section("追加（只能追加，不能改）") {
                TextField("写点什么", text: $text, axis: .vertical)
                Button("追加") {
                    let t = text; text = ""
                    Task {
                        await store.journalAdd(sid: selected, text: t)
                        content = await store.journal(sid: selected)
                    }
                }
                .disabled(text.isEmpty)
            }
            if let m = store.message { Section { Text(m).font(.caption) } }
        }
        .navigationTitle("学生历程")
        .task {
            if selected == 0, let first = roster.first { selected = first.id; content = await store.journal(sid: first.id) }
        }
    }
}

// MARK: - 日志 / 分组 / 初始化

struct LogsPage: View {
    @ObservedObject var store: MoreStore

    var body: some View {
        List {
            let logs = store.data["logs"] as? [[String: Any]] ?? []
            if logs.isEmpty { Text("（暂无日志）") }
            ForEach(Array(logs.prefix(60).enumerated()), id: \.offset) { item in
                let l = item.element
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(l["action"] as? String ?? "") · \(l["student_name"] as? String ?? "")")
                        Text("\(l["timestamp"] as? String ?? "") · \(l["reason"] as? String ?? "")")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    let c = (l["score_change"] as? NSNumber)?.doubleValue ?? 0
                    Text(String(format: "%+.1f", c))
                }
            }
        }
        .navigationTitle("操作日志")
    }
}

struct GroupsPage: View {
    @ObservedObject var store: MoreStore
    @State private var name = ""
    @State private var sid = ""
    @State private var msg: String?

    var body: some View {
        List {
            Section("建组 / 删组 / 加人 / 移人（与网页同一份数据）") {
                TextField("分组名，如 第一组", text: $name)
                TextField("学号", text: $sid)
                HStack {
                    Button("创建") { Task { await store.groupEdit(name: name, sid: sid, op: "create") } }
                    Button("删除") { Task { await store.groupEdit(name: name, sid: sid, op: "delete") } }
                    Button("加人") { Task { await store.groupEdit(name: name, sid: sid, op: "add") } }
                    Button("移人") { Task { await store.groupEdit(name: name, sid: sid, op: "remove") } }
                }.buttonStyle(.bordered)
                if let m = store.message { Text(m).font(.caption).foregroundStyle(.secondary) }
            }
            let groups = store.data["groups"] as? [String: Any] ?? [:]
            let scores = store.data["scores"] as? [String: Any] ?? [:]
            if groups.isEmpty { Text("（还没有分组）") }
            ForEach(groups.keys.sorted(), id: \.self) { g in
                let members = groups[g] as? [Any] ?? []
                let rows = members.compactMap { m -> (String, Double)? in
                    let s = "\(m)"
                    guard s != "0" else { return nil }
                    var sc = 0.0
                    if let arr = scores[s] as? [Any], arr.count > 1 { sc = (arr[1] as? NSNumber)?.doubleValue ?? 0 }
                    return (s, sc)
                }
                let avg = rows.isEmpty ? 0 : rows.reduce(0) { $0 + $1.1 } / Double(rows.count)
                VStack(alignment: .leading, spacing: 2) {
                    HStack { Text(g).bold(); Spacer(); Text(String(format: "均分 %.1f", avg)) }
                    Text(rows.map { $0.0 }.joined(separator: "、")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("分组")
    }
}

struct InitPage: View {
    @ObservedObject var store: MoreStore
    @State private var count = "51"
    @State private var subjects = "语文,数学"

    var body: some View {
        List {
            Section("⚠ 会重建作业数据，已有记录清空") {
                TextField("学生数", text: $count)
                TextField("科目，逗号分隔", text: $subjects)
                Button("执行初始化") {
                    Task {
                        await store.initHomework(students: Int(count) ?? 0,
                                                 subjects: subjects.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
                    }
                }
            }
            Section("已配置的作业种类") {
                let types = store.meta["types"] as? [String: Any] ?? [:]
                let names = store.meta["subjectNames"] as? [String: Any] ?? [:]
                if types.isEmpty { Text("（没配种类：按整科已交计）").font(.caption) }
                ForEach(Array(types.keys.sorted().enumerated()), id: \.offset) { _, k in
                    let list = types[k] as? [Any] ?? []
                    VStack(alignment: .leading) {
                        Text(names[k] as? String ?? "科目\(k)").bold()
                        Text((0..<list.count).map { "\($0)=\(list[$0])" }.joined(separator: " "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let m = store.message { Section { Text(m).font(.caption) } }
        }
        .navigationTitle("作业初始化")
    }
}


// MARK: - 职位 / 考试 / 汇报 / 备份 / 账号

struct PositionsPage: View {
    @ObservedObject var store: MoreStore

    var body: some View {
        List {
            let pos = store.data["positions"] as? [String: Any] ?? [:]
            let list = pos["list"] as? [String: Any] ?? [:]
            if list.isEmpty { Text("（还没有职位）") }
            ForEach(list.keys.sorted(), id: \.self) { name in
                let item = list[name] as? [String: Any] ?? [:]
                let members = (item["members"] as? [Any]) ?? []
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(name).bold()
                        Spacer()
                        Text("月薪 \(Int((item["salary"] as? NSNumber)?.doubleValue ?? 0))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Text(members.isEmpty ? "（空缺）" : members.map { "\($0)" }.joined(separator: "、"))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Section {
                Text("上次发薪: \(pos["lastPayDate"] as? String ?? "从未")")
                    .font(.caption)
                Button("给所有班干发工资（进金币）") { Task { await store.paySalaries() } }
            }
            if let m = store.message { Section { Text(m).font(.caption) } }
        }
        .navigationTitle("职位")
    }
}

struct ExamPage: View {
    @ObservedObject var store: MoreStore

    var body: some View {
        List {
            let exams = store.data["examScores"] as? [String: Any] ?? [:]
            let scores = store.data["scores"] as? [String: Any] ?? [:]
            if exams.isEmpty { Text("（还没有考试记录）") }
            ForEach(exams.keys.sorted(), id: \.self) { sid in
                let rows = exams[sid] as? [[String: Any]] ?? []
                let name = studentName(scores, sid)
                Section("学号 \(sid) \(name)") {
                    ForEach(Array(rows.enumerated()), id: \.offset) { item in
                        let e = item.element
                        let sc = (e["score"] as? NSNumber)?.doubleValue ?? 0
                        let full = (e["full"] as? NSNumber)?.doubleValue ?? 0
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(e["subject"] as? String ?? "") · \(e["name"] as? String ?? "")")
                                Text(e["date"] as? String ?? "").font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(String(format: "%.0f/%.0f (%.0f%%)", sc, full, full > 0 ? sc / full * 100 : 0))
                        }
                    }
                }
            }
        }
        .navigationTitle("考试分数")
    }
}

struct ReportPage: View {
    @ObservedObject var store: MoreStore
    @State private var delta = "2"
    @State private var reason = ""

    var body: some View {
        List {
            let today = todayText()
            let dr = (store.data["dailyReport"] as? [String: Any])?[today] as? [String: Any]
            Section("今日汇报 \(today)") {
                Text((dr?["allReported"] as? Bool ?? false) ? "✅ 已全部汇报" : "⭕ 未完成")
                Text("最后汇报: \(dr?["lastReportTime"] as? String ?? "-")").font(.caption)
            }
            Section("概况") {
                let rows = scoreRows(store.data)
                Text("全班 \(rows.count) 人").font(.caption)
                let avg = rows.isEmpty ? 0 : rows.reduce(0) { $0 + $1.score } / Double(rows.count)
                Text(String(format: "平均分 %.1f", avg)).font(.caption)
            }
            Section("写操作（与网页一致）") {
                HStack {
                    TextField("加减值", text: $delta).frame(width: 70)
                    TextField("原因", text: $reason)
                }
                HStack {
                    Button("✅ 全部已汇报") { Task { await store.reportWrite(op: "all") } }
                    Button("⬇ 批量应用到全班") {
                        Task { await store.reportBatch(delta: Double(delta) ?? 0, reason: reason) }
                    }
                    Button("↺ 重置") { Task { await store.reportWrite(op: "reset") } }
                }.buttonStyle(.bordered)
                if let m = store.message { Text(m).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("每日汇报")
    }
}

struct BackupPage: View {
    @ObservedObject var store: MoreStore
    @State private var done = false

    var body: some View {
        List {
            let json: String = {
                guard JSONSerialization.isValidJSONObject(store.data),
                      let d = try? JSONSerialization.data(withJSONObject: store.data, options: [.prettyPrinted]) else { return "" }
                return String(data: d, encoding: .utf8) ?? ""
            }()
            Section("整班数据 \(json.count) 字节") {
                Text("和网页「导出数据」一样，就是 /api/class/{id} 的 data 原样。").font(.caption)
                Button {
                    copyToClipboard(json)
                } label: {
                    Label("复制整班 JSON", systemImage: "doc.on.doc")
                }
                .disabled(json.isEmpty)
            }
            Section { Text(json.prefix(800) + (json.count > 800 ? "…" : "")).font(.caption2) }
        }
        .navigationTitle("数据备份")
    }
}

struct AccountPage: View {
    let model: AppModel

    var body: some View {
        List {
            row("服务器", model.server)
            row("班级", model.classId)
            row("密码", model.password.isEmpty ? "未设置" : "已设置")
            Section {
                Text("账号权限（root/admin/user）由网页端角色决定，原生端只按班级密码鉴权。").font(.caption)
            }
        }
        .navigationTitle("账号")
    }
}


// MARK: - 小工具（压低最低系统版本用）

private func todayText() -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

private func studentName(_ scores: [String: Any], _ sid: String) -> String {
    if let arr = scores[sid] as? [Any], !arr.isEmpty, let n = arr[0] as? String { return n }
    if let o = scores[sid] as? [String: Any], let n = o["name"] as? String { return n }
    return "学号\(sid)"
}

private extension AccountPage {
    @ViewBuilder
    func row(_ key: String, _ value: String) -> some View {
        HStack {
            Text(key)
            Spacer()
            Text(value).foregroundStyle(.secondary).lineLimit(1)
        }
    }
}

#if os(macOS)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

private func copyToClipboard(_ text: String) {
    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
    #elseif os(iOS)
    UIPasteboard.general.string = text
    #endif
}


struct AutoEventsPage: View {
    @ObservedObject var store: MoreStore
    @State private var name = "每周一加分"
    @State private var freq = "weekly:1"
    @State private var targets = "all"
    @State private var change = "+1"
    @State private var reason = ""

    var body: some View {
        List {
            let events = store.data["autoEvents"] as? [[String: Any]] ?? []
            if events.isEmpty { Text("（还没有自动事件）") }
            ForEach(events.indices, id: \.self) { i in
                let e = events[i]
                let freqText = e["frequency"] as? String ?? "daily"
                let whenText: String = {
                    if freqText == "weekly" { return "周\(e["dayOfWeek"] as? Int ?? 1)" }
                    if freqText == "monthly" { return "\(e["dayOfMonth"] as? Int ?? 1) 日" }
                    return ""
                }()
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("[\(i)] \(e["name"] as? String ?? "")").bold()
                        Text("\(freqText) \(whenText) · \(((e["targets"] as? [Any]) ?? []).map { "\($0)" }.joined(separator: ","))")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(String(format: "%+.1f", (e["change"] as? NSNumber)?.doubleValue ?? 0)).bold()
                }
            }
            Section("执行") {
                Button("▶ 立即执行到期事件") { Task { await store.runAutoEvents() } }
                Text("daily 每天、weekly 指定星期、monthly 指定日；同一事件同一天只跑一次。").font(.caption2)
            }
            Section("添加事件") {
                TextField("名称", text: $name)
                TextField("频率 daily / weekly:1 / monthly:15", text: $freq)
                TextField("目标 all / group:组名 / 学号", text: $targets)
                TextField("分值，例如 +1", text: $change)
                TextField("原因（可空）", text: $reason)
                Button("添加") {
                    Task { await store.addAutoEvent(name: name, freqSpec: freq, targets: targets, change: Double(change) ?? 0, reason: reason) }
                }
            }
            if let m = store.message { Section { Text(m).font(.caption) } }
        }
        .navigationTitle("自动事件")
    }
}
