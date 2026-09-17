import SwiftUI

struct CalisthenicsView: View {
    @State private var exercises: [CalisthenicsExercise] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingAdd = false
    @State private var newExerciseName = ""

    var body: some View {
        List {
            if exercises.isEmpty && !isLoading {
                Text("Add an exercise to start tracking sets.")
                    .foregroundStyle(.secondary)
            }
            ForEach(exercises) { exercise in
                ExerciseRow(exercise: exercise, onChange: { updated in
                    if let idx = exercises.firstIndex(where: { $0.id == updated.id }) { exercises[idx] = updated }
                })
            }
            .onDelete(perform: deleteExercises)
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Calisthenics")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .alert("Add an exercise", isPresented: $showingAdd) {
            TextField("e.g. Push-ups", text: $newExerciseName)
            Button("Cancel", role: .cancel) { newExerciseName = "" }
            Button("Add") { Task { await addExercise() } }
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
            exercises = try await APIClient.shared.get("/calisthenics")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func addExercise() async {
        let name = newExerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
        newExerciseName = ""
        guard !name.isEmpty else { return }
        do {
            struct NewExercise: Encodable { let name: String }
            let exercise: CalisthenicsExercise = try await APIClient.shared.post("/calisthenics", body: NewExercise(name: name))
            exercises.append(exercise)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteExercises(at offsets: IndexSet) {
        let toDelete = offsets.map { exercises[$0] }
        exercises.remove(atOffsets: offsets)
        Task {
            for exercise in toDelete {
                let _: OKResponse? = try? await APIClient.shared.delete("/calisthenics/\(exercise.id)")
            }
        }
    }
}

private struct ExerciseRow: View {
    let exercise: CalisthenicsExercise
    let onChange: (CalisthenicsExercise) -> Void

    var body: some View {
        HStack {
            Text(exercise.name).font(.headline)
            Spacer()
            Button { Task { await log(-1) } } label: { Image(systemName: "minus.circle") }
                .buttonStyle(.plain)
                .disabled(exercise.todayTotal <= 0)
            Text("\(exercise.todayTotal)")
                .font(.title3.monospacedDigit().bold())
                .frame(minWidth: 36)
            Button { Task { await log(1) } } label: { Image(systemName: "plus.circle") }
                .buttonStyle(.plain)
            ForEach([5, 10, 25], id: \.self) { n in
                Button("+\(n)") { Task { await log(n) } }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
    }

    private func log(_ reps: Int) async {
        do {
            struct LogReps: Encodable { let reps: Int }
            let updated: CalisthenicsExercise = try await APIClient.shared.post("/calisthenics/\(exercise.id)/log", body: LogReps(reps: reps))
            onChange(updated)
        } catch {
            // Best-effort; the row just won't update this tap.
        }
    }
}
