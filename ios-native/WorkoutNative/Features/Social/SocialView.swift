import SwiftUI

struct SocialView: View {
    @State private var friends: [Friend] = []
    @State private var pendingRequests: [PendingFriendRequest] = []
    @State private var inviteToken: String?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if !pendingRequests.isEmpty {
                    Section("Friend requests") {
                        ForEach(pendingRequests) { request in
                            HStack {
                                Text(request.requesterName)
                                Spacer()
                                Button("Accept") { Task { await accept(request) } }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                Button("Ignore") { Task { await reject(request) } }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                            }
                        }
                    }
                }

                Section("Friends") {
                    if friends.isEmpty && !isLoading {
                        Text("No friends yet — share your invite link to connect.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(friends) { friend in
                        Text(friend.name)
                    }
                    .onDelete(perform: removeFriends)
                }

                Section {
                    ShareLink(item: inviteURL) {
                        Label("Share invite link", systemImage: "square.and.arrow.up")
                    }
                    .disabled(inviteToken == nil)
                }
            }
            .navigationTitle("Social")
            .task { await load() }
            .refreshable { await load() }
            .alert("Something went wrong", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private var inviteURL: URL {
        URL(string: "https://workout.pablogeorge.org/invite/\(inviteToken ?? "")")!
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let friendsResponse: FriendsResponse = APIClient.shared.get("/social/friends")
            struct InviteLinkResponse: Decodable { let inviteToken: String }
            async let inviteResponse: InviteLinkResponse = APIClient.shared.get("/social/invite-link")
            let (fr, ir) = try await (friendsResponse, inviteResponse)
            friends = fr.friends
            pendingRequests = fr.pendingRequests
            inviteToken = ir.inviteToken
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func accept(_ request: PendingFriendRequest) async {
        do {
            let _: OKResponse = try await APIClient.shared.post("/social/friends/\(request.friendshipId)/accept")
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reject(_ request: PendingFriendRequest) async {
        do {
            let _: OKResponse = try await APIClient.shared.post("/social/friends/\(request.friendshipId)/reject")
            pendingRequests.removeAll { $0.id == request.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func removeFriends(at offsets: IndexSet) {
        let toRemove = offsets.map { friends[$0] }
        friends.remove(atOffsets: offsets)
        Task {
            for friend in toRemove {
                let _: OKResponse? = try? await APIClient.shared.delete("/social/friends/\(friend.friendshipId)")
            }
        }
    }
}
