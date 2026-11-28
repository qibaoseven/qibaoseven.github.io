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
    ]

    var body: some View {
        NavigationStack {
            List {
                if let m = store.message {
                    Text(m).font(.caption).foregroundStyle(.secondary)
                }
                ForEach(entries, id: \.0) { key, label in
                    NavigationLink(label) { destination(key) }
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
                .onChange(of: selected) { _, newValue in
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
            ForEach(Array(logs.prefix(60).enumerated()), id: \.offset) { _, l in
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

    var body: some View {
        List {
            let groups = store.data["groups"] as? [String: Any] ?? [:]
            let scores = store.data["scores"] as? [String: Any] ?? [:]
            if groups.isEmpty { Text("（还没有分组）") }
            ForEach(Array(groups.keys.sorted().enumerated()), id: \.offset) { _, g in
                let members = groups[g] as? [Any] ?? []
                let rows = members.compactMap { m -> (String, Double)? in
                    let sid = "\(m)"
                    guard sid != "0" else { return nil }
                    var sc = 0.0
                    if let arr = scores[sid] as? [Any], arr.count > 1 { sc = (arr[1] as? NSNumber)?.doubleValue ?? 0 }
                    return (sid, sc)
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
