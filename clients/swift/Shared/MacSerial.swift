#if os(macOS)
import Foundation

/// macOS 版：USB 串口是开放的（/dev/cu.*），可以直接读读卡器吐出的 UID，不必手抄。
final class MacSerial: ObservableObject {
    @Published var ports: [String] = []
    @Published var connected = false
    @Published var log: String = ""
    @Published var lastUID: String = ""

    private var handle: FileHandle?
    private var buffer = ""

    init() { refresh() }

    func refresh() {
        let dev = (try? FileManager.default.contentsOfDirectory(atPath: "/dev")) ?? []
        ports = dev.filter { $0.hasPrefix("cu.") }.map { "/dev/" + $0 }.sorted()
    }

    func connect(_ path: String) {
        close()
        guard !path.isEmpty else { log = "先选一个串口"; return }
        handle = FileHandle(forUpdatingAtPath: path)
        connected = handle != nil
        log = connected ? "已连接 \(path)" : "打不开 \(path)（可能被别的程序占用）"
        handle?.readabilityHandler = { [weak self] h in
            let data = h.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self else { return }
                self.log += text
                if self.log.count > 2000 { self.log = String(self.log.suffix(2000)) }
                // 板子每行形如 UID:12:34:56:78:9A:BC:DE
                for line in text.split(separator: "\n") {
                    let s = String(line)
                    if let r = s.range(of: "UID:") {
                        self.lastUID = String(s[r.upperBound...]).trimmingCharacters(in: .whitespaces)
                    }
                }
            }
        }
    }

    func close() {
        handle?.readabilityHandler = nil
        try? handle?.close()
        handle = nil
        connected = false
    }

    func send(_ text: String) {
        guard let h = handle else { log += "\n未连接\n"; return }
        h.write((text + "\n").data(using: .utf8) ?? Data())
    }
}
#endif
