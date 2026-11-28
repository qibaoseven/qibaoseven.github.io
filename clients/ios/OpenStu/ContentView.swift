import SwiftUI

struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        NavigationStack {
            if model.configured {
                TeacherView(model: model)
            } else {
                ConfigView(model: model)
            }
        }
    }
}

// MARK: - 配置页

struct ConfigView: View {
    @ObservedObject var model: AppModel
    @State private var classes: [ClassInfo] = []
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Section("服务器") {
                TextField("https://os-stu.netlify.app", text: $model.server)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Section("班级") {
                TextField("class_xxxxxxxx", text: $model.classId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("班级密码", text: $model.password)
            }
            Section {
                Button(busy ? "拉取中…" : "拉取班级列表") {
                    Task {
                        busy = true
                        classes = await model.fetchClasses()
                        busy = false
                        if classes.isEmpty { error = "没拿到班级，检查服务器地址或网络" }
                    }
                }
                Button("保存并进入") {
                    model.save()
                }
                .disabled(model.classId.isEmpty || model.password.isEmpty)
            }
            if !classes.isEmpty {
                Section("服务器上的班级（点一下填进班级 ID）") {
                    ForEach(classes) { c in
                        Button {
                            model.classId = c.id
                        } label: {
                            VStack(alignment: .leading) {
                                Text(c.name)
                                Text(c.id).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("连接班级")
    }
}

// MARK: - 登记页

struct TeacherView: View {
    @ObservedObject var model: AppModel
    @State private var target: (id: Int, name: String)?
    @State private var showSettings = false

    var body: some View {
        List {
            Section {
                if let req = model.required {
                    VStack(alignment: .leading, spacing: 6) {
                        ProgressView(value: req.total > 0 ? Double(req.submitted) / Double(req.total) : 0)
                        Text("已交 \(req.submitted)/\(req.total) · \(req.date)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(req.required, id: \.self) { s in
                                    Text(req.subjectName(s))
                                        .font(.caption)
                                        .padding(.horizontal, 10).padding(.vertical, 4)
                                        .background(Color.accentColor.opacity(0.15))
                                        .clipShape(Capsule())
                                }
                            }
                        }
                    }
                } else {
                    Text(model.loading ? "加载中…" : "暂无数据，下拉刷新").font(.caption)
                }
                if let message = model.message {
                    Text(message).font(.caption).foregroundStyle(.blue)
                }
            }

            Section("学生") {
                ForEach(model.roster?.sorted ?? [], id: \.id) { st in
                    Button {
                        target = st
                    } label: {
                        HStack {
                            Text("\(st.id)").monospacedDigit().frame(width: 40, alignment: .leading)
                            Text(st.name)
                            Spacer()
                            if let req = model.required {
                                let done = req.required.filter { model.marks[st.id]?[$0] == true }.count
                                Text("\(done)/\(req.required.count)")
                                    .font(.caption)
                                    .foregroundStyle(done == req.required.count ? .green : .secondary)
                            }
                        }
                    }
                }
            }
        }
        .refreshable { await model.refresh() }
        .navigationTitle(model.classId.isEmpty ? "OpenStu" : model.classId)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("设置") { showSettings = true }
            }
        }
        .sheet(isPresented: $showSettings) {
            ConfigView(model: model).navigationTitle("设置")
        }
        .task { if model.required == nil { await model.refresh() } }
        .confirmationDialog(
            target.map { "\($0.id) \($0.name) · 登记" } ?? "",
            isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
            titleVisibility: .visible
        ) {
            if let t = target, let req = model.required {
                ForEach(req.required, id: \.self) { s in
                    let done = model.marks[t.id]?[s] == true
                    Button("\(req.subjectName(s))\(done ? "（已交）" : "")") {
                        target = nil
                        Task { await model.submit(student: t, subjectId: s) }
                    }
                    .disabled(done)
                }
                Button("取消", role: .cancel) { target = nil }
            }
        }
    }
}
