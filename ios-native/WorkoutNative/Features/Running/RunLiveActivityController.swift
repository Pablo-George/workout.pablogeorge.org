import ActivityKit
import Foundation

/// Starts/updates/ends the Lock Screen + Dynamic Island Live Activity for an
/// in-progress run. No-ops safely on devices/OS versions or Focus states
/// where Live Activities aren't available (`areActivitiesEnabled == false`)
/// — the run still tracks fine, it just won't show on the Lock Screen.
@MainActor
final class RunLiveActivityController {
    private var activity: Activity<RunActivityAttributes>?

    func start() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = RunActivityAttributes(startedAt: Date())
        let initialState = RunActivityAttributes.ContentState(distanceMi: 0, elapsedSec: 0, paceLabel: "—", isPaused: false)

        do {
            activity = try Activity.request(
                attributes: attributes,
                content: .init(state: initialState, staleDate: nil)
            )
        } catch {
            // Live Activity is a nice-to-have; failing to start one should
            // never block the run itself.
        }
    }

    func update(distanceMi: Double, elapsedSec: Int, paceLabel: String, isPaused: Bool) {
        guard let activity else { return }
        let state = RunActivityAttributes.ContentState(distanceMi: distanceMi, elapsedSec: elapsedSec, paceLabel: paceLabel, isPaused: isPaused)
        Task { await activity.update(.init(state: state, staleDate: nil)) }
    }

    func end(distanceMi: Double, elapsedSec: Int, paceLabel: String) {
        guard let activity else { return }
        let finalState = RunActivityAttributes.ContentState(distanceMi: distanceMi, elapsedSec: elapsedSec, paceLabel: paceLabel, isPaused: true)
        Task { await activity.end(.init(state: finalState, staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(10))) }
        self.activity = nil
    }
}
