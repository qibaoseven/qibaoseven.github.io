import Foundation
import CryptoKit

struct ClassInfo: Decodable, Identifiable { let id: String; let name: String }

struct Roster: Decodable {
    let classId: String
    let count: Int
    let students: [String: String]
    var sorted: [(id: Int, name: String)] {
        students.compactMap { k, v in Int(k).map { (id: $0, name: v) } }.sorted { $0.id < $1.id }
    }
}

struct RequiredToday: Decodable {
    let date: String
    let required: [Int]
    let subjectNames: [String: String]
    let studentCount: Int
    let submitted: Int
    let total: Int
    func name(_ i: Int) -> String { subjectNames[String(i)] ?? "科目\(i)" }
}

struct HomeworkData: Decodable { let data: [[[Int]]]; let dateFrom: String; let dateTo: String; let totalDays: Int }

struct SubmitResult: Decodable { let studentId: Int; let targetDate: String; let subjectId: Int; let changed: Bool }

enum ApiError: LocalizedError {
    case http(Int, String)
    var errorDescription: String? { if case let .http(c, m) = self { return "HTTP \(c) · \(m)" }; return nil }
}

actor ApiClient {
    var server = "https://os-stu.netlify.app"
    var classId = ""
    var password = ""

    func configure(_ server: String, _ classId: String, _ password: String) {
        var s = server.trimmingCharacters(in: .whitespaces)
        while s.hasSuffix("/") { s.removeLast() }
        self.server = s; self.classId = classId.trimmingCharacters(in: .whitespaces); self.password = password
    }

    private func hash(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func call(_ path: String, method: String = "GET", body: [String: Any]? = nil, auth: Bool = true) async throws -> Data {
        var req = URLRequest(url: URL(string: server + path)!)
        req.httpMethod = method
        req.timeoutInterval = 18
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if auth && !classId.isEmpty {
            req.setValue(password, forHTTPHeaderField: "X-Password")
            req.setValue(hash(password), forHTTPHeaderField: "X-Password-Hash")
        }
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            var msg = ""
            if let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let e = o["error"] as? String { msg += " · " + e }
                if let c = o["code"] as? String { msg += " (\(c))" }
            }
            throw ApiError.http(code, msg)
        }
        return data
    }

    func classes() async throws -> [ClassInfo] { try JSONDecoder().decode([ClassInfo].self, from: try await call("/api/classes", auth: false)) }
    func roster() async throws -> Roster { try JSONDecoder().decode(Roster.self, from: try await call("/api/class/\(classId)/students")) }
    func required() async throws -> RequiredToday {
        try JSONDecoder().decode(RequiredToday.self, from: try await call("/api/class/\(classId)/homework/required?date=\(Self.today())"))
    }
    func homework() async throws -> HomeworkData { try JSONDecoder().decode(HomeworkData.self, from: try await call("/api/class/\(classId)/homework")) }
    func addUid(uid: String, studentId: Int, subjectId: Int? = nil, date: String? = nil) async throws -> [String: Any] {
        var body: [String: Any] = ["uid": uid, "student_id": studentId]
        if let subjectId { body["subject_id"] = subjectId }
        if let date { body["target_date"] = date }
        let data = try await call("/api/class/\(classId)/uuids/add", method: "POST", body: body)
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    func submit(studentId: Int, subjectId: Int, date: String) async throws -> SubmitResult {
        let body: [String: Any] = ["student_id": studentId, "target_date": date, "subject_id": subjectId]
        return try JSONDecoder().decode(SubmitResult.self, from: try await call("/api/class/\(classId)/homework/update", method: "POST", body: body))
    }

    static func today() -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date())
    }
}
