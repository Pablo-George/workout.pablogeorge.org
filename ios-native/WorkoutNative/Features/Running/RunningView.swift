import SwiftUI

struct RunningView: View {
    @State private var runs: [RunLog] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingTracker = false

    var body: some View {
        List {
            Section {
                Button {
                    showingTracker = true
                } label: {
                    Label("Start Run", systemImage: "play.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .listRowInsets(EdgeInsets())
                .padding(.vertical, 4)
                .listRowBackground(Color.clear)
            }

            Section("Recent runs") {
                if runs.isEmpty && !isLoading {
                    Text("No runs logged yet.")
                        .foregroundStyle(.secondary)
                }
                ForEach(runs) { run in
                    RunRow(run: run)
                }
                .onDelete(perform: deleteRuns)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Running")
        .task { await load() }
        .refreshable { await load() }
        .fullScreenCover(isPresented: $showingTracker) {
            NavigationStack {
                RunTrackingView(onSaved: {
                    showingTracker = false
                    Task { await load() }
                })
                .navigationTitle("Run")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { showingTracker = false }
                    }
                }
            }
        }
        .alert("Something went wrong", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            runs = try await APIClient.shared.get("/running")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteRuns(at offsets: IndexSet) {
        let toDelete = offsets.map { runs[$0] }
        runs.remove(atOffsets: offsets)
        Task {
            for run in toDelete {
                let _: OKResponse? = try? await APIClient.shared.delete("/running/\(run.id)")
            }
        }
    }
}

private struct RunRow: View {
    let run: RunLog

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(String(format: "%.2f mi", run.distanceMi)).font(.headline)
                Text("\(formatDuration(run.durationSec)) · \(paceLabel) /mi")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(run.completedOn)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var paceLabel: String {
        guard let pace = run.paceSecPerMi else { return "—" }
        let m = Int(pace) / 60, s = Int(pace) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func formatDuration(_ sec: Int) -> String {
        let h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}
