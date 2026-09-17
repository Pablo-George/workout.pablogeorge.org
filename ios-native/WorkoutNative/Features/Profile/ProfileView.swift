import Charts
import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var auth: AuthManager

    @State private var summary: ProfileSummary?
    @State private var goal: GoalSummary?
    @State private var weightChart: [WeightChartPoint] = []
    @State private var runChart: [RunChartPoint] = []
    @State private var errorMessage: String?
    @State private var showingWeightEntry = false
    @State private var weightInput = ""

    var body: some View {
        NavigationStack {
            List {
                if let summary {
                    Section {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(summary.displayName).font(.headline)
                                Text("\(summary.totalSessions) sessions · \(summary.totalPrs) PRs")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    }
                }

                Section("Body weight") {
                    HStack {
                        if let weight = summary?.currentWeightLbs {
                            Text("\(weight.formatted()) lbs")
                                .font(.title2.bold())
                        } else {
                            Text("No weigh-ins yet").foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Log weight") { showingWeightEntry = true }
                    }

                    if !weightChart.isEmpty {
                        Chart(weightChart) { point in
                            LineMark(x: .value("Date", point.date), y: .value("Weight", point.weight))
                                .interpolationMethod(.catmullRom)
                            PointMark(x: .value("Date", point.date), y: .value("Weight", point.weight))
                        }
                        .frame(height: 140)
                        .chartXAxis(.hidden)
                    }
                }

                if let goal {
                    Section("Goal") {
                        if let goalWeight = goal.goalWeightLbs {
                            HStack {
                                Text("Goal weight")
                                Spacer()
                                Text("\(goalWeight.formatted()) lbs").foregroundStyle(.secondary)
                            }
                        }
                        if let dailyGoal = goal.dailyCalorieGoal {
                            HStack {
                                Text("Daily calorie target")
                                Spacer()
                                Text("\(Int(dailyGoal)) kcal").foregroundStyle(.secondary)
                            }
                        }
                        HStack {
                            Text("Estimated burn today")
                            Spacer()
                            Text("\(Int(goal.todayCaloriesBurned)) kcal").foregroundStyle(.secondary)
                        }
                        if let months = goal.weighInsProjectionMonths {
                            HStack {
                                Text("Projected time to goal")
                                Spacer()
                                Text(String(format: "%.1f months", months)).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !runChart.isEmpty {
                    Section("Running (30 days)") {
                        Chart(runChart) { point in
                            BarMark(x: .value("Date", point.date), y: .value("Miles", point.miles))
                        }
                        .frame(height: 140)
                        .chartXAxis(.hidden)
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) { auth.signOut() }
                }
            }
            .navigationTitle("Profile")
            .task { await load() }
            .refreshable { await load() }
            .alert("Log weight", isPresented: $showingWeightEntry) {
                TextField("Weight (lbs)", text: $weightInput).keyboardType(.decimalPad)
                Button("Cancel", role: .cancel) { weightInput = "" }
                Button("Save") { Task { await logWeight() } }
            }
            .alert("Something went wrong", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func load() async {
        do {
            async let summaryResponse: ProfileSummary = APIClient.shared.get("/profile")
            async let goalResponse: GoalSummary = APIClient.shared.get("/profile/goal")
            async let weightResponse: [WeightChartPoint] = APIClient.shared.get("/profile/weight/chart")
            async let runResponse: [RunChartPoint] = APIClient.shared.get("/running/chart")
            (summary, goal, weightChart, runChart) = try await (summaryResponse, goalResponse, weightResponse, runResponse)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func logWeight() async {
        guard let weight = Double(weightInput) else { return }
        weightInput = ""
        do {
            struct WeightBody: Encodable { let weightLbs: Double }
            struct WeightResult: Decodable { let weightLbs: Double; let loggedOn: String }
            let _: WeightResult = try await APIClient.shared.post("/profile/weight", body: WeightBody(weightLbs: weight))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
