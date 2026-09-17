import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthManager

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 8) {
                Image(systemName: "figure.run.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)
                Text("WORKOUT")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text("Lifting, calisthenics, and running — all in one place.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()

            VStack(spacing: 12) {
                Button {
                    auth.signIn(provider: .google)
                } label: {
                    Label("Continue with Google", systemImage: "globe")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    auth.signIn(provider: .apple)
                } label: {
                    Label("Continue with Apple", systemImage: "apple.logo")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(.horizontal, 32)

            if let error = auth.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 32)
            }

            Spacer().frame(height: 24)
        }
    }
}
