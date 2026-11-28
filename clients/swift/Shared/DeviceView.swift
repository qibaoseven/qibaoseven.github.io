import SwiftUI

/// 设备管理（五端共用）
/// 串口 / 刷录：Apple 平台与 tvOS/watchOS 都拿不到 USB 串口栈，直接写"无法使用"，
/// 但"手动填 UID"是可用的，走 /uuids/add。
struct DeviceView: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    @State private var uid = ""
    @State private var studentIndex = 0
    @State private var subjectIndex = 0

    private var platformName: String {
        #if os(iOS)
        return "iOS / iPadOS"
        #elseif os(macOS)
        return "macOS"
        #elseif os(tvOS)
        return "tvOS"
        #elseif os(watchOS)
        return "watchOS"
        #elseif os(visionOS)
        return "visionOS"
        #else
        return "Apple 平台"
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("设备管理").font(.title2.bold())
                Spacer()
                Button("关闭") { dismiss() }
            }

            capabilityCard(
                title: "⚡ 自动刷录固件",
                reason: "\(platformName) 不向第三方开放 USB 串口，连 esptool 需要的串口端点都拿不到，因此无法在端内刷录。",
                action: "替代：把板子插到电脑 → 网页端「硬件登记 → ⚡ 自动刷录」；或电脑执行 esptool.py --port <端口> write_flash 0x0 openstu-v0.46-hw4-1M64.bin"
            )

            capabilityCard(
                title: "🔌 串口查看 UID",
                reason: "\(platformName) 没有 Web Serial 等价能力，读不到读卡器吐的 UID 行。",
                action: "替代：电脑上用网页端连接，或手动把 UID 抄到下面输入框。"
            )

            manualform

            if let m = model.message {
                Text(m).font(.caption).foregroundStyle(.blue)
            }
            Spacer()
        }
        .padding(20)
    }

    private func capabilityCard(title: String, reason: String, action: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            Text("✖ 无法使用 —— \(reason)")
                .font(.caption).foregroundStyle(.red)
            Text(action).font(.caption2).foregroundStyle(.secondary)
            Button("无法使用（此端不支持）") {}
                .disabled(true)
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var manualform: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("✍ 手动填写 UID").font(.headline)
            Text("卡面或读卡器上抄下来的 UID，1~7 字节，如 12:34:56:78:9A:BC:DE").font(.caption).foregroundStyle(.secondary)
            TextField("UID", text: $uid)
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                #endif

            if let roster = model.roster?.sorted, !roster.isEmpty {
                Picker("学号", selection: $studentIndex) {
                    ForEach(Array(roster.enumerated()), id: \.offset) { i, st in
                        Text("\(st.id) \(st.name)").tag(i)
                    }
                }
                if let req = model.required {
                    Picker("学科（可选）", selection: $subjectIndex) {
                        Text("不设置").tag(0)
                        ForEach(req.required, id: \.self) { s in
                            Text(req.name(s)).tag(req.required.firstIndex(of: s)! + 1)
                        }
                    }
                }
                Button("提交绑定") {
                    guard studentIndex < roster.count else { return }
                    let sid = roster[studentIndex].id
                    let sub: Int? = subjectIndex == 0 ? nil : model.required?.required[subjectIndex - 1]
                    Task { await model.addUid(uid: uid.trimmingCharacters(in: .whitespaces), studentId: sid, subjectId: sub) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(uid.trimmingCharacters(in: .whitespaces).isEmpty)
            } else {
                Text("名册没加载，先回主界面刷新一次").font(.caption).foregroundStyle(.orange)
            }
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
