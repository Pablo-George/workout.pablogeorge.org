import SwiftUI

struct FeedView: View {
    @State private var posts: [FeedPost] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var composerText = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Share something...", text: $composerText, axis: .vertical)
                        Button("Post") { Task { await post() } }
                            .disabled(composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                if posts.isEmpty && !isLoading {
                    Text("No posts yet — add friends to see their activity here.")
                        .foregroundStyle(.secondary)
                }

                ForEach(posts) { post in
                    PostRow(post: post)
                }
            }
            .navigationTitle("Home")
            .task { await load() }
            .refreshable { await load() }
            .alert("Something went wrong", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            posts = try await APIClient.shared.get("/social/feed")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func post() async {
        let content = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        composerText = ""
        do {
            let _: CreatedResponse = try await APIClient.shared.postMultipart(
                "/social/posts",
                fields: ["content": content],
                fileField: nil, fileData: nil, fileName: nil, mimeType: nil
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct PostRow: View {
    let post: FeedPost

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(post.authorName).font(.subheadline.bold())
                Spacer()
                Text(post.timeAgo).font(.caption).foregroundStyle(.secondary)
            }
            if let content = post.content {
                Text(content).font(.body)
            }
            if post.kind == "PR", let liftName = post.prLiftName {
                Label("PR: \(liftName) — \(Int(post.prWeight ?? 0)) lbs × \(post.prReps ?? 0)", systemImage: "trophy.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 4)
    }
}
