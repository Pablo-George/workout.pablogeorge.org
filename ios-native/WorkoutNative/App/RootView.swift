import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.default, value: auth.isAuthenticated)
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            FeedView()
                .tabItem { Label("Home", systemImage: "house.fill") }

            RecordView()
                .tabItem { Label("Record", systemImage: "figure.strengthtraining.traditional") }

            SocialView()
                .tabItem { Label("Social", systemImage: "person.2.fill") }

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
        }
        .tint(.accentColor)
    }
}
