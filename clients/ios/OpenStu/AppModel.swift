import SwiftUI
import Combine

/// 界面状态（@MainActor 下更新）
@MainActor
final class AppModel: ObservableObject {
    @Published var server: String = "https://os-stu.netlify.app"
    @Published var classId: String = ""
    @Published var password: String = ""
    @Published var configured: Bool = false

    @Published var required: RequiredToday?
    @Published var roster: Roster?
    @Published var marks: [Int: [Int: Bool]] = [:]
    @Published var loading = false
    @Published var message: String?

    private let api = ApiClient()

    init() { load() }

    // ---------- 配置 ----------
    func load() {
        server = UserDefaults.standard.string(forKey: "server") ?? server
        classId = UserDefaults.standard.string(forKey: "class_id") ?? ""
        password = UserDefaults.standard.string(forKey: "password") ?? ""
        configured = !classId.isEmpty && !password.isEmpty
    }

    func save() {
        UserDefaults.standard.set(server, forKey: "server")
        UserDefaults.standard.set(classId, forKey: "class_id")
        UserDefaults.standard.set(password, forKey: "password")
        configured = !classId.isEmpty && !password.isEmpty
    }

    func fetchClasses() async -> [ClassInfo] {
        await api.configure(server: server, classId: classId, password: password)
        return (try? await api.classes()) ?? []
    }

    // ---------- 刷新 ----------
    func refresh() async {
        await api.configure(server: server, classId: classId, password: password)
        loading = true
        defer { loading = false }
        do {
            let req = try await api.required()
            required = req
            roster = try await api.roster()
            let hw = try await api.allHomework()
            marks = Self.matrix(hw, date: req.date)
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    func submit(student: (id: Int, name: String), subjectId: Int) async {
        guard let date = required?.date else { return }
        await api.configure(server: server, classId: classId, password: password)
        do {
            let r = try await api.submit(studentId: student.id, subjectId: subjectId, date: date)
            let name = required?.subjectName(subjectId) ?? "科目\(subjectId)"
            message = r.changed
                ? "已登记：\(student.name) · \(name)"
                : "\(student.name) · \(name) 原本已交，未重复计分"
            await refresh()
        } catch {
            message = "登记失败: \(error.localizedDescription)"
        }
    }

    /// 把 [天][学生][科目] 展开成 [学号: [科目: 是否已交]]
    static func matrix(_ hw: HomeworkData, date: String) -> [Int: [Int: Bool]] {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        guard let from = f.date(from: hw.dateFrom), let to = f.date(from: date) else { return [:] }
        let idx = Calendar.current.dateComponents([.day], from: from, to: to).day ?? -1
        guard idx >= 0, idx < hw.data.count else { return [:] }
        var out: [Int: [Int: Bool]] = [:]
        for (sid, row) in hw.data[idx].enumerated() where sid > 0 {
            out[sid] = row.enumerated().reduce(into: [:]) { $0[$1.offset] = $1.element != 0 }
        }
        return out
    }
}
