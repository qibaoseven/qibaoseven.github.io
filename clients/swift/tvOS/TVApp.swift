import SwiftUI

@main
struct OpenStuTVApp: App {
    var body: some Scene { WindowGroup { TVRootView() } }
}

/// tvOS：焦点导航，学生做成大卡片，遥控器左右滑
struct TVRootView: View {
    @StateObject private var model = AppModel()
    @State private var target: (id: Int, name: String)?
    @State private var showConfig = false
    @State private var showDevice = false
    @State private var showMore = false

    var body: some View {
        VStack(spacing: 24) {
            HStack {
                VStack(alignment: .leading) {
                    Text("OpenStu").font(.largeTitle.bold())
                    if let req = model.required {
                        Text("\(req.date) · 已交 \(req.submitted)/\(req.total)").font(.callout).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button("刷新") { Task { await model.refresh() } }
                Button("更多功能") { showMore = true }
                Button("设备管理") { showDevice = true }
                Button("设置") { showConfig = true }
            }
            .padding(.horizontal, 60)
            .padding(.top, 40)

            if let req = model.required {
                ProgressView(value: req.total > 0 ? Double(req.submitted) / Double(req.total) : 0)
                    .padding(.horizontal, 60)
            }

            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 20)], spacing: 20) {
                    ForEach(model.roster?.sorted ?? [], id: \.id) { st in
                        Button {
                            target = st
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("\(st.id)").font(.headline).foregroundStyle(.secondary)
                                Text(st.name).font(.title3.bold())
                                if let req = model.required {
                                    let done = req.required.filter { model.marks[st.id]?[$0] == true }.count
                                    Text("\(done)/\(req.required.count) 科").font(.caption)
                                        .foregroundStyle(done == req.required.count ? .green : .secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18)
                        }
                        .buttonStyle(.card)
                    }
                }
                .padding(.horizontal, 60)
                .padding(.bottom, 40)
            }
        }
        .sheet(isPresented: $showConfig) {
            VStack(spacing: 16) {
                Text("连接班级").font(.title2.bold())
                TextField("服务器", text: $model.server)
                TextField("班级 ID", text: $model.classId)
                SecureField("班级密码", text: $model.password)
                HStack {
                    Button("保存") { model.save(); showConfig = false; Task { await model.refresh() } }
                    Button("取消") { showConfig = false }
                }
            }
            .padding(60)
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
        .sheet(isPresented: $showDevice) { DeviceView(model: model).frame(width: 900, height: 700) }
        .task { if model.configured && model.required == nil { await model.refresh() } }
    }
}
