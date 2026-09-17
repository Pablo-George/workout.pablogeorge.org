import Foundation

// MARK: - Envelope

/// Every /api/* response is either {"data": T} or {"error": "message"}.
struct APIEnvelope<T: Decodable>: Decodable {
    let data: T?
    let error: String?
}

struct OKResponse: Decodable {
    let ok: Bool
}

struct CreatedResponse: Decodable {
    let id: Int
}

// MARK: - Auth / Profile

struct UserProfile: Codable, Identifiable {
    var id: String { userId }
    let userId: String
    let displayName: String
    let pictureUrl: String?
}

struct ProfileSummary: Codable {
    let userId: String
    let displayName: String
    let pictureUrl: String?
    let hideWeight: Bool
    let currentWeightLbs: Double?
    let currentWeightDate: String?
    let totalSessions: Int
    let totalPrs: Int
}

struct GoalSummary: Codable {
    let goalWeightLbs: Double?
    let dailyCalorieGoal: Double?
    let currentWeight: Double?
    let currentWeightDate: String?
    let todayCaloriesBurned: Double
    let avgNetCaloriesPerDay: Double?
    let trend: Trend?
    let weighInsProjectionMonths: Double?
    let calorieProjectionMonths: Double?
    let insufficientWeightData: Bool

    struct Trend: Codable {
        let lbsPerWeek: Double
    }
}

struct WeightChartPoint: Codable, Identifiable {
    var id: String { date }
    let date: String
    let weight: Double
}

// MARK: - Workouts / Lifting

struct Lift: Codable, Identifiable {
    let id: Int
    let name: String
    let trainingMax: Double?
    let currentWeek: Int?
    let weekLabel: String?
}

struct WorkoutSet: Codable, Identifiable {
    var id: String { "\(percentageLabel)-\(reps)-\(amrap)" }
    let warmup: Bool
    let percentageLabel: String
    let weight: Double
    let reps: Int
    let amrap: Bool
    let platesDisplay: String
    let repsLabel: String
}

struct WorkoutPlan: Codable {
    let configured: Bool
    let liftName: String?
    let week: Int?
    let trainingMax: Double?
    let sets: [WorkoutSet]?
    let weekLabel: String?
}

struct CompleteWorkoutResult: Codable {
    let trainingMaxDelta: Double
    let newTrainingMax: Double
    let workoutLogId: Int
    let isPr: Bool
    let pr: PrInfo?

    struct PrInfo: Codable {
        let liftName: String
        let weight: Double
        let reps: Int
    }
}

struct WorkoutHistoryEntry: Codable, Identifiable {
    let id: Int
    let liftName: String
    let week: Int
    let amrapReps: Int
    let completedOn: String
    let topSetWeight: Double?
    let estimatedOneRepMax: Double?
    let isPr: Bool
}

struct TrainingMaxChartSeries: Codable, Identifiable {
    var id: String { label }
    let label: String
    let points: [ChartPoint]
}

struct ChartPoint: Codable {
    let x: String
    let y: Double
}

// MARK: - Calisthenics

struct CalisthenicsExercise: Codable, Identifiable {
    let id: Int
    let name: String
    let todayTotal: Int
}

struct CalisthenicsChartSeries: Codable, Identifiable {
    var id: String { label }
    let label: String
    let points: [ChartPoint]
}

// MARK: - Running

struct RunLog: Codable, Identifiable {
    let id: Int
    let distanceMi: Double
    let durationSec: Int
    let completedOn: String
    let source: String
    let paceSecPerMi: Double?
}

struct RunChartPoint: Codable, Identifiable {
    var id: String { date }
    let date: String
    let miles: Double
}

// MARK: - Social

struct FeedPost: Codable, Identifiable {
    let id: Int
    let authorId: String
    let authorName: String
    let authorPicture: String?
    let content: String?
    let imageUrl: String?
    let kind: String
    let prLiftName: String?
    let prWeight: Double?
    let prReps: Int?
    let timeAgo: String
    let replies: [FeedReply]
}

struct FeedReply: Codable, Identifiable {
    let id: Int
    let authorId: String
    let authorName: String
    let authorPicture: String?
    let content: String?
    let timeAgo: String
}

struct Friend: Codable, Identifiable {
    let friendshipId: Int
    let userId: String
    let name: String
    let pictureUrl: String?
    var id: Int { friendshipId }
}

struct PendingFriendRequest: Codable, Identifiable {
    let friendshipId: Int
    let requesterEmail: String
    let requesterName: String
    let requesterPicture: String?
    var id: Int { friendshipId }
}

struct FriendsResponse: Codable {
    let friends: [Friend]
    let pendingRequests: [PendingFriendRequest]
}

// MARK: - Calories

struct CalorieEntry: Codable, Identifiable {
    let id: Int
    let description: String
    let calories: Int
    let proteinG: Int?
    let carbsG: Int?
    let imageUrl: String?
    let loggedOn: String
}

struct CalorieDay: Codable {
    let loggedOn: String
    let entries: [CalorieEntry]
    let totalCalories: Int
    let totalProteinG: Int
    let totalCarbsG: Int
}
