import SwiftUI

/// 连接班级设置（iOS / tvOS / visionOS / watchOS 共用；macOS 有自己的 SettingsPane）
struct SettingsView: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var classes: [ClassInfo] = []
    @State private var error: String?

    var body: some View {
        VStack(spacing: 12) {
            Text("连接班级").font(.headline)
            TextField("服务器", text: $model.server)
            TextField("班级 ID", text: $model.classId)
            SecureField("班级密码", text: $model.password)
            HStack {
                Button("拉取班级列表") {
                    Task {
                        classes = await model.fetchClasses()
                        if classes.isEmpty { error = "没拿到班级，检查服务器/网络" }
                    }
                }
                Button("保存") { model.save(); dismiss() }
                    .disabled(model.classId.isEmpty || model.password.isEmpty)
            }
            if !classes.isEmpty {
                Text("服务器上的班级（点一下填入）").font(.caption).foregroundStyle(.secondary)
                ScrollView {
                    ForEach(classes) { c in
                        Button("\(c.name) · \(c.id)") { model.classId = c.id }
                            .font(.caption)
                    }
                }
                .frame(maxHeight: 160)
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
        }
        .padding(20)
    }
}
