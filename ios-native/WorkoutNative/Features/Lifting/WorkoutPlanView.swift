import SwiftUI

struct WorkoutPlanView: View {
    let lift: Lift
    let onChanged: () -> Void

    @State private var plan: WorkoutPlan?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var trainingMaxInput = ""
    @State private var amrapInput = ""
    @State private var showingComplete = false
    @State private var completionResult: CompleteWorkoutResult?

    var body: some View {
        Group {
            if let plan, plan.configured {
                configuredPlan(plan)
            } else {
                setupForm
            }
        }
        .navigationTitle(lift.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .alert("Something went wrong", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        .alert(prCelebrationTitle, isPresented: Binding(get: { completionResult != nil }, set: { if !$0 { completionResult = nil } })) {
            Button("Nice!") { completionResult = nil; onChanged() }
        } message: {
            if let result = completionResult {
                Text("Training max: \(result.newTrainingMax.formatted()) lbs (\(result.trainingMaxDelta >= 0 ? "+" : "")\(Int(result.trainingMaxDelta)))")
            }
        }
    }

    private var prCelebrationTitle: String {
        completionResult?.isPr == true ? "🎉 New PR!" : "Workout logged"
    }

    private func configuredPlan(_ plan: WorkoutPlan) -> some View {
        List {
            Section {
                HStack {
                    Text(plan.weekLabel ?? "")
                    Spacer()
                    Text("TM \(Int(plan.trainingMax ?? 0)) lbs").foregroundStyle(.secondary)
                }
            }

            Section("Sets") {
                ForEach(plan.sets ?? []) { set in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(Int(set.weight)) lbs · \(set.percentageLabel)")
                                .font(.headline)
                            Text(set.platesDisplay)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(set.repsLabel)
                            .font(.subheadline.bold())
                            .foregroundStyle(set.amrap ? Color.accentColor : .primary)
                    }
                }
            }

            Section {
                Button("Complete Workout") { showingComplete = true }
            }
        }
        .alert("AMRAP reps completed", isPresented: $showingComplete) {
            TextField("Reps", text: $amrapInput).keyboardType(.numberPad)
            Button("Cancel", role: .cancel) { amrapInput = "" }
            Button("Log it") { Task { await complete() } }
        }
    }

    private var setupForm: some View {
        Form {
            Section("Set a training max to get started") {
                TextField("Training max (lbs)", text: $trainingMaxInput)
                    .keyboardType(.decimalPad)
                Button("Start") { Task { await setup() } }
                    .disabled(Double(trainingMaxInput) == nil)
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            plan = try await APIClient.shared.get("/workouts/\(lift.id)/plan")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func setup() async {
        guard let trainingMax = Double(trainingMaxInput) else { return }
        do {
            struct Setup: Encodable { let trainingMax: Double }
            let _: OKResponse = try await APIClient.shared.post("/workouts/\(lift.id)/setup", body: Setup(trainingMax: trainingMax))
            onChanged()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func complete() async {
        guard let amrapReps = Int(amrapInput) else { return }
        amrapInput = ""
        do {
            struct Complete: Encodable { let amrapReps: Int }
            completionResult = try await APIClient.shared.post("/workouts/\(lift.id)/complete", body: Complete(amrapReps: amrapReps))
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
