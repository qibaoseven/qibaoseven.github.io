import SwiftUI

/// macOS 端：左侧班级信息 + 右侧学生表格，工具栏刷新/设置
struct MacRootView: View {
    @StateObject private var model = AppModel()
    @State private var target: (id: Int, name: String)?
    @State private var showSettings = false
    @State private var showDevice = false
    @State private var showMore = false

    var body: some View {
        Group {
            if model.configured {
                HSplitView {
                    sidebar.frame(minWidth: 240, maxWidth: 320)
                    studentList
                }
            } else {
                SettingsPane(model: model, embedded: false)
                    .frame(maxWidth: 520)
                    .padding(40)
            }
        }
        .toolbar {
            ToolbarItemGroup {
                Button { Task { await model.refresh() } } label: { Label("刷新", systemImage: "arrow.clockwise") }
                    .keyboardShortcut("r")
                Button { showMore = true } label: { Label("更多功能", systemImage: "square.grid.2x2") }
                Button { showDevice = true } label: { Label("设备管理", systemImage: "cable.connector") }
                Button { showSettings = true } label: { Label("设置", systemImage: "gearshape") }
            }
        }
        .sheet(isPresented: $showSettings) { SettingsPane(model: model, embedded: true).frame(width: 460, height: 420) }
        .sheet(isPresented: $showDevice) { DeviceView(model: model).frame(minWidth: 560, minHeight: 620) }
        .sheet(isPresented: $showMore) { MoreView(model: model).frame(minWidth: 720, minHeight: 720) }
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
        .onReceive(NotificationCenter.default.publisher(for: .openstuRefresh)) { _ in
            Task { await model.refresh() }
        }
        .task { if model.configured && model.required == nil { await model.refresh() } }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("OpenStu").font(.largeTitle.bold())
            Text(model.classId.isEmpty ? "未配置" : model.classId).font(.caption).foregroundStyle(.secondary)

            if let req = model.required {
                VStack(alignment: .leading, spacing: 6) {
                    Text(req.date).font(.headline)
                    ProgressView(value: req.total > 0 ? Double(req.submitted) / Double(req.total) : 0)
                    Text("已交 \(req.submitted)/\(req.total)").font(.caption)
                    Divider()
                    ForEach(req.required, id: \.self) { s in Text("· \(req.name(s))").font(.callout) }
                }
            }
            if let m = model.message { Text(m).font(.caption).foregroundStyle(.blue) }
            Spacer()
            Button("打开设备管理") { showSettings = true }
                .help("设置班级 / 查看固件信息")
        }
        .padding(20)
    }

    private var studentList: some View {
        List(model.roster?.sorted ?? [], id: \.id) { st in
            Button {
                target = st
            } label: {
                HStack {
                    Text("\(st.id)").monospacedDigit().frame(width: 44, alignment: .leading)
                    Text(st.name)
                    Spacer()
                    if let req = model.required {
                        let done = req.required.filter { model.marks[st.id]?[$0] == true }.count
                        Text("\(done)/\(req.required.count)")
                            .font(.caption).foregroundStyle(done == req.required.count ? .green : .secondary)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, 4)
        }
        .listStyle(.inset)
    }
}

/// 配置页（macOS 与四端共用的简化版）
struct SettingsPane: View {
    @ObservedObject var model: AppModel
    var embedded: Bool
    @State private var classes: [ClassInfo] = []
    @State private var error: String?

    var body: some View {
        Form {
            Section(embedded ? "设置" : "连接班级") {
                TextField("服务器", text: $model.server)
                TextField("班级 ID", text: $model.classId)
                SecureField("班级密码", text: $model.password)
            }
            Section {
                Button("拉取班级列表") {
                    Task {
                        classes = await model.fetchClasses()
                        if classes.isEmpty { error = "没拿到班级，检查服务器或网络" }
                    }
                }
                Button("保存") { model.save() }
                    .disabled(model.classId.isEmpty || model.password.isEmpty)
            }
            if !classes.isEmpty {
                Section("服务器上的班级") {
                    ForEach(classes) { c in
                        Button("\(c.name) · \(c.id)") { model.classId = c.id }
                    }
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            .formStyle(.grouped)
        }
    }
}
