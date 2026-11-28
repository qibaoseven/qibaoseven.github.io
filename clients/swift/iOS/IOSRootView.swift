import SwiftUI

/// iOS / iPadOS：完整功能（配置、今日进度、名册、登记、设备管理的手填部分）
/// 唯一缺的是串口/刷录——系统不给，设备管理页明确写"无法使用"。
struct IOSRootView: View {
    @StateObject private var model = AppModel()
    @State private var target: (id: Int, name: String)?
    @State private var showSettings = false
    @State private var showDevice = false
    @State private var showMore = false

    var body: some View {
        NavigationView {
            Group {
                if model.configured { studentList } else { onboarding }
            }
            .navigationTitle(model.classId.isEmpty ? "OpenStu" : model.classId)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button("刷新") { Task { await model.refresh() } }
                        Button("更多功能") { showMore = true }
                        Button("设备管理") { showDevice = true }
                        Button("设置") { showSettings = true }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
            .sheet(isPresented: $showSettings) { SettingsView(model: model) }
            .sheet(isPresented: $showDevice) { DeviceView(model: model) }
            .sheet(isPresented: $showMore) { MoreView(model: model) }
            .confirmationDialog(target.map { "\($0.id) \($0.name) · 登记" } ?? "",
                                isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
                                titleVisibility: .visible) {
                if let t = target, let req = model.required {
                    ForEach(req.required, id: \.self) { s in
                        let done = model.marks[t.id]?[s] == true
                        Button("\(req.name(s))\(done ? "（已交）" : "")") {
                            target = nil
                            Task { await model.submit(student: t, subject: s) }
                        }.disabled(done)
                    }
                    Button("取消", role: .cancel) { target = nil }
                }
            }
            .task { if model.configured && model.required == nil { await model.refresh() } }
        }
    }

    private var onboarding: some View {
        VStack(spacing: 16) {
            Image(systemName: "graduationcap.fill").font(.system(size: 52)).foregroundStyle(.tint)
            Text("先连一个班级").font(.title2.bold())
            Text("填服务器、班级 ID 和密码，之后这里就直接显示今日应交和登记入口。")
                .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("去设置") { showSettings = true }.buttonStyle(.borderedProminent)
        }
        .padding(32)
    }

    private var studentList: some View {
        List {
            Section {
                if let req = model.required {
                    VStack(alignment: .leading, spacing: 8) {
                        ProgressView(value: req.total > 0 ? Double(req.submitted) / Double(req.total) : 0)
                        Text("已交 \(req.submitted)/\(req.total) · \(req.date)").font(.caption).foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(req.required, id: \.self) { s in
                                    Text(req.name(s)).font(.caption)
                                        .padding(.horizontal, 10).padding(.vertical, 4)
                                        .background(Color.accentColor.opacity(0.15), in: Capsule())
                                }
                            }
                        }
                    }
                } else if model.loading {
                    Text("加载中…").font(.caption)
                }
                if let m = model.message { Text(m).font(.caption).foregroundStyle(.blue) }
            }

            Section("学生") {
                ForEach(model.roster?.sorted ?? [], id: \.id) { st in
                    Button { target = st } label: {
                        HStack {
                            Text("\(st.id)").monospacedDigit().frame(width: 44, alignment: .leading)
                            Text(st.name)
                            Spacer()
                            if let req = model.required {
                                let done = req.required.filter { model.marks[st.id]?[$0] == true }.count
                                Text("\(done)/\(req.required.count)").font(.caption)
                                    .foregroundStyle(done == req.required.count ? .green : .secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .refreshable { await model.refresh() }
    }
}
