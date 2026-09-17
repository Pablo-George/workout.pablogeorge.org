import ActivityKit
import Foundation

/// Shared between the main app and the Widget Extension target — add this
/// file to BOTH targets' membership in Xcode (File Inspector > Target
/// Membership), or the extension won't build against the same type the app
/// uses to start/update the activity.
struct RunActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var distanceMi: Double
        var elapsedSec: Int
        var paceLabel: String
        var isPaused: Bool
    }

    var startedAt: Date
}
