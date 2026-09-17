import AuthenticationServices
import Foundation
import UIKit

/// Drives sign-in through the existing web OAuth flow (Google / Sign in with
/// Apple) via ASWebAuthenticationSession, then exchanges the resulting
/// custom-scheme redirect for a bearer token — see
/// server/src/routes/auth.ts's `finishAuth` and `signNativeToken`.
///
/// Register the "workoutapp" URL scheme in the app target's Info.plist
/// (URL Types) for the callback to reach this app.
@MainActor
final class AuthManager: NSObject, ObservableObject {
    static let shared = AuthManager()

    @Published private(set) var isAuthenticated = false
    @Published private(set) var currentUser: UserProfile?
    @Published var lastError: String?

    private static let tokenKey = "apiToken"
    private var webAuthSession: ASWebAuthenticationSession?

    var token: String? {
        KeychainHelper.get(forKey: Self.tokenKey)
    }

    override init() {
        super.init()
        isAuthenticated = token != nil
    }

    /// Call once at app launch: if a token is stored, verify it's still
    /// valid and load the current profile.
    func bootstrap() async {
        guard token != nil else { return }
        do {
            currentUser = try await APIClient.shared.get("/auth/me")
            isAuthenticated = true
        } catch {
            // Token expired/invalid — APIClient's 401 handling already
            // calls signOut(), nothing further to do here.
        }
    }

    func signIn(provider: Provider) {
        let base = "https://workout.pablogeorge.org"
        let url = URL(string: "\(base)/\(provider.path)?client=ios")!

        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "workoutapp") { [weak self] callbackURL, error in
            Task { @MainActor in
                self?.handleCallback(callbackURL: callbackURL, error: error)
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.webAuthSession = session
        session.start()
    }

    private func handleCallback(callbackURL: URL?, error: Error?) {
        if let error {
            if (error as NSError).code != ASWebAuthenticationSessionError.canceledLogin.rawValue {
                lastError = "Sign-in failed: \(error.localizedDescription)"
            }
            return
        }
        guard
            let callbackURL,
            let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
            let token = components.queryItems?.first(where: { $0.name == "token" })?.value
        else {
            lastError = "Sign-in did not return a token."
            return
        }

        KeychainHelper.set(token, forKey: Self.tokenKey)
        isAuthenticated = true
        Task { await bootstrap() }
    }

    func signOut() {
        KeychainHelper.remove(forKey: Self.tokenKey)
        isAuthenticated = false
        currentUser = nil
    }

    enum Provider {
        case google, apple
        var path: String {
            switch self {
            case .google: return "auth/google"
            case .apple: return "auth/apple"
            }
        }
    }
}

extension AuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Any active window works here since the session is short-lived and
        // modal; grabbing the first connected scene's key window is enough
        // for a single-window app.
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
