import SwiftUI

@main
struct OpenStuWatchApp: App {
    var body: some Scene { WindowGroup { WatchRootView() } }
}

struct WatchRootView: View {
    @StateObject private var model = AppModel()
    @State private var push: (id: Int, name: String)?

    var body: some View {
        NavigationStack {
            List {
                if let req = model.required {
                    Section {
                        VStack(alignment: .leading) {
                            Text("\(req.submitted)/\(req.total)").font(.title2.bold())
                            ProgressView(value: req.total > 0 ? Double(req.submitted) / Double(req.total) : 0)
                        }
                    }
                }
                Section("学生") {
                    ForEach(model.roster?.sorted ?? [], id: \.id) { st in
                        Button {
                            push = st
                        } label: {
                            HStack {
                                Text("\(st.id)").monospacedDigit()
                                Text(st.name).lineLimit(1)
                                Spacer()
                                if let req = model.required {
                                    let done = req.required.filter { model.marks[st.id]?[$0] == true }.count
                                    Text("\(done)/\(req.required.count)").font(.caption2)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("OpenStu")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { DeviceView(model: model) } label: { Image(systemName: "cable.connector") }
                }
            }
            .navigationDestination(item: $push) { st in
                SubjectList(model: model, student: st)
            }
            .task { if model.configured { await model.refresh() } }
        }
    }
}

struct SubjectList: View {
    @ObservedObject var model: AppModel
    let student: (id: Int, name: String)

    var body: some View {
        List {
            if let req = model.required {
                ForEach(req.required, id: \.self) { s in
                    let done = model.marks[student.id]?[s] == true
                    Button {
                        Task { await model.submit(student: student, subject: s) }
                    } label: {
                        HStack {
                            Text(req.name(s))
                            Spacer()
                            if done { Image(systemName: "checkmark").foregroundStyle(.green) }
                        }
                    }
                    .disabled(done)
                }
            } else {
                Text("没有今日数据").font(.caption)
            }
        }
        .navigationTitle("\(student.id) \(student.name)")
    }
}
