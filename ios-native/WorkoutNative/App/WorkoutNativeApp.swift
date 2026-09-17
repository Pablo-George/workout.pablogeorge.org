import SwiftUI

@main
struct WorkoutNativeApp: App {
    @StateObject private var auth = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .task { await auth.bootstrap() }
        }
    }
}
