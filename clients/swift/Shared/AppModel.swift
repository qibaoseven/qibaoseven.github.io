import SwiftUI
import Combine

@MainActor
final class AppModel: ObservableObject {
    @Published var server: String
    @Published var classId: String
    @Published var password: String
    @Published var configured: Bool

    @Published var required: RequiredToday?
    @Published var roster: Roster?
    @Published var marks: [Int: [Int: Bool]] = [:]
    @Published var loading = false
    @Published var message: String?

    private let api = ApiClient()

    init() {
        let d = UserDefaults.standard
        server = d.string(forKey: "server") ?? "https://os-stu.netlify.app"
        classId = d.string(forKey: "class_id") ?? ""
        password = d.string(forKey: "password") ?? ""
        configured = !classId.isEmpty && !password.isEmpty
    }

    func save() {
        let d = UserDefaults.standard
        d.set(server, forKey: "server"); d.set(classId, forKey: "class_id"); d.set(password, forKey: "password")
        configured = !classId.isEmpty && !password.isEmpty
    }

    func fetchClasses() async -> [ClassInfo] {
        await api.configure(server, classId, password)
        return (try? await api.classes()) ?? []
    }

    func refresh() async {
        await api.configure(server, classId, password)
        loading = true; defer { loading = false }
        do {
            let req = try await api.required()
            required = req
            roster = try await api.roster()
            marks = Self.matrix(try await api.homework(), date: req.date)
            message = nil
        } catch { message = error.localizedDescription }
    }

    func submit(student: (id: Int, name: String), subject: Int) async {
        guard let date = required?.date else { return }
        await api.configure(server, classId, password)
        do {
            let r = try await api.submit(studentId: student.id, subjectId: subject, date: date)
            message = r.changed ? "已登记 \(student.name)" : "\(student.name) 原本已交"
            await refresh()
        } catch { message = "失败: \(error.localizedDescription)" }
    }

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
