import SwiftUI

@main
struct OpenStuMacApp: App {
    var body: some Scene {
        WindowGroup {
            MacRootView()
                .frame(minWidth: 760, minHeight: 520)
        }
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("刷新 (⌘R)") { NotificationCenter.default.post(name: .openstuRefresh, object: nil) }
                    .keyboardShortcut("r")
            }
        }
    }
}

extension Notification.Name {
    static let openstuRefresh = Notification.Name("openstu.refresh")
}
