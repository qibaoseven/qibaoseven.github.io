import SwiftUI

@main
struct OpenStuVisionApp: App {
    var body: some Scene {
        WindowGroup {
            VisionRootView()
        }
        .defaultSize(width: 900, height: 640)
    }
}

/// visionOS：立体卡片 + 玻璃材质，点击卡片正面弹出科目面板
struct VisionRootView: View {
    @StateObject private var model = AppModel()
    @State private var target: (id: Int, name: String)?
    @State private var showConfig = false
    @State private var showDevice = false
    @State private var showMore = false

    var body: some View {
        VStack(spacing: 20) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("OpenStu").font(.extraLargeTitle2.bold())
                    if let req = model.required {
                        Text("\(req.date) · 已交 \(req.submitted)/\(req.total)").foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button("刷新") { Task { await model.refresh() } }
                Button("更多功能") { showMore = true }
                Button("设备管理") { showDevice = true }
                Button("设置") { showConfig = true }
            }
            if let req = model.required {
                ProgressView(value: req.total > 0 ? Double(req.submitted) / Double(req.total) : 0)
            }
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 18)], spacing: 18) {
                    ForEach(model.roster?.sorted ?? [], id: \.id) { st in
                        Button {
                            target = st
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(st.name).font(.title3.bold())
                                Text("学号 \(st.id)").font(.caption).foregroundStyle(.secondary)
                                if let req = model.required {
                                    let done = req.required.filter { model.marks[st.id]?[$0] == true }.count
                                    Text("\(done)/\(req.required.count) 科").font(.caption)
                                        .foregroundStyle(done == req.required.count ? .green : .secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                        }
                        .buttonStyle(.borderless)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
                        .hoverEffect(.lift)
                    }
                }
            }
        }
        .padding(28)
        .sheet(isPresented: $showConfig) {
            Form {
                TextField("服务器", text: $model.server)
                TextField("班级 ID", text: $model.classId)
                SecureField("班级密码", text: $model.password)
                Button("保存") { model.save(); showConfig = false; Task { await model.refresh() } }
            }
            .frame(width: 420, height: 300)
            .padding(20)
        }
        .confirmationDialog(target.map { "\($0.id) \($0.name) · 登记" } ?? "",
                            isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
                            titleVisibility: .visible) {
            if let t = target, let req = model.required {
                ForEach(req.required, id: \.self) { s in
                    Button(req.name(s)) { target = nil; Task { await model.submit(student: t, subject: s) } }
                }
                Button("取消", role: .cancel) { target = nil }
            }
        }
        .sheet(isPresented: $showMore) { MoreView(model: model).frame(width: 1000, height: 720) }
        .sheet(isPresented: $showDevice) { DeviceView(model: model).frame(width: 700, height: 620) }
        .task { if model.configured && model.required == nil { await model.refresh() } }
    }
}
