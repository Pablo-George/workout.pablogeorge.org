import SwiftUI

struct LiftListView: View {
    @State private var lifts: [Lift] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingAddLift = false
    @State private var newLiftName = ""

    var body: some View {
        List {
            if lifts.isEmpty && !isLoading {
                Text("Add your first lift to get started.")
                    .foregroundStyle(.secondary)
            }
            ForEach(lifts) { lift in
                NavigationLink(value: lift) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(lift.name).font(.headline)
                        if let weekLabel = lift.weekLabel {
                            Text(weekLabel).font(.caption).foregroundStyle(.secondary)
                        } else {
                            Text("Not started").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .onDelete(perform: deleteLifts)
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Lifting")
        .navigationDestination(for: Lift.self) { lift in
            WorkoutPlanView(lift: lift, onChanged: { Task { await load() } })
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAddLift = true } label: { Image(systemName: "plus") }
            }
        }
        .alert("Add a lift", isPresented: $showingAddLift) {
            TextField("e.g. Bench Press", text: $newLiftName)
            Button("Cancel", role: .cancel) { newLiftName = "" }
            Button("Add") { Task { await addLift() } }
        }
        .alert("Something went wrong", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            lifts = try await APIClient.shared.get("/workouts")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func addLift() async {
        let name = newLiftName.trimmingCharacters(in: .whitespacesAndNewlines)
        newLiftName = ""
        guard !name.isEmpty else { return }
        do {
            struct NewLift: Encodable { let name: String }
            let lift: Lift = try await APIClient.shared.post("/workouts", body: NewLift(name: name))
            lifts.append(lift)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteLifts(at offsets: IndexSet) {
        let toDelete = offsets.map { lifts[$0] }
        lifts.remove(atOffsets: offsets)
        Task {
            for lift in toDelete {
                let _: OKResponse? = try? await APIClient.shared.delete("/workouts/\(lift.id)")
            }
        }
    }
}

extension Lift: Hashable {
    static func == (lhs: Lift, rhs: Lift) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
