import Foundation
import CryptoKit

// MARK: - 模型

struct ClassInfo: Decodable, Identifiable {
    let id: String
    let name: String
}

struct RequiredToday: Decodable {
    let date: String
    let required: [Int]
    let subjectNames: [String: String]
    let studentCount: Int
    let submitted: Int
    let total: Int

    func subjectName(_ index: Int) -> String {
        subjectNames[String(index)] ?? "科目\(index)"
    }
}

struct Roster: Decodable {
    let classId: String
    let count: Int
    let students: [String: String]

    var sorted: [(id: Int, name: String)] {
        students.compactMap { key, value in Int(key).map { (id: $0, name: value) } }
            .sorted { $0.id < $1.id }
    }
}

struct HomeworkData: Decodable {
    let data: [[[Int]]]
    let dateFrom: String
    let dateTo: String
    let totalDays: Int
}

struct SubmitResult: Decodable {
    let studentId: Int
    let targetDate: String
    let subjectId: Int
    let changed: Bool
}

enum ApiError: LocalizedError {
    case http(Int, String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case let .http(code, message): return "HTTP \(code) · \(message)"
        case let .decoding(msg): return "数据解析失败: \(msg)"
        }
    }
}

actor ApiClient {
    var server: String = "https://os-stu.netlify.app"
    var classId: String = ""
    var password: String = ""

    func configure(server: String, classId: String, password: String) {
        self.server = server.trimmingCharacters(in: .whitespaces)
        while self.server.hasSuffix("/") { self.server.removeLast() }
        self.classId = classId.trimmingCharacters(in: .whitespaces)
        self.password = password
    }

    var isConfigured: Bool { !classId.isEmpty && !password.isEmpty }

    private func hash(_ s: String) -> String {
        let digest = SHA256.hash(data: Data(s.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, auth: Bool = true) async throws -> (Data, Int) {
        var req = URLRequest(url: URL(string: server + path)!)
        req.httpMethod = method
        req.timeoutInterval = 15
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
        return (data, code)
    }

    private func errorText(_ data: Data, _ code: Int) -> String {
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            var s = ""
            if let e = obj["error"] as? String { s += " · " + e }
            if let c = obj["code"] as? String { s += " (\(c))" }
            return s.isEmpty ? "HTTP \(code)" : s
        }
        return "HTTP \(code)"
    }

    func classes() async throws -> [ClassInfo] {
        let (data, code) = try await request("/api/classes", auth: false)
        guard (200..<300).contains(code) else { throw ApiError.http(code, errorText(data, code)) }
        return try JSONDecoder().decode([ClassInfo].self, from: data)
    }

    func roster() async throws -> Roster {
        let (data, code) = try await request("/api/class/\(classId)/students")
        guard (200..<300).contains(code) else { throw ApiError.http(code, errorText(data, code)) }
        return try JSONDecoder().decode(Roster.self, from: data)
    }

    func required(date: String? = nil) async throws -> RequiredToday {
        let d = date ?? Self.today()
        let (data, code) = try await request("/api/class/\(classId)/homework/required?date=\(d)")
        guard (200..<300).contains(code) else { throw ApiError.http(code, errorText(data, code)) }
        return try JSONDecoder().decode(RequiredToday.self, from: data)
    }

    func allHomework() async throws -> HomeworkData {
        let (data, code) = try await request("/api/class/\(classId)/homework")
        guard (200..<300).contains(code) else { throw ApiError.http(code, errorText(data, code)) }
        return try JSONDecoder().decode(HomeworkData.self, from: data)
    }

    func submit(studentId: Int, subjectId: Int, date: String, typeId: Int? = nil) async throws -> SubmitResult {
        var body: [String: Any] = [
            "student_id": studentId,
            "target_date": date,
            "subject_id": subjectId,
        ]
        if let typeId { body["type_id"] = typeId }
        let (data, code) = try await request("/api/class/\(classId)/homework/update", method: "POST", body: body)
        guard (200..<300).contains(code) else { throw ApiError.http(code, errorText(data, code)) }
        return try JSONDecoder().decode(SubmitResult.self, from: data)
    }

    static func today() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}
