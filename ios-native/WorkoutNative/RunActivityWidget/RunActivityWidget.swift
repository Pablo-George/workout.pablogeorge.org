import ActivityKit
import SwiftUI
import WidgetKit

/// This file belongs in the Widget Extension TARGET, not the main app
/// target — create that target in Xcode (File > New > Target > Widget
/// Extension, uncheck "Include Configuration Intent"), delete its
/// boilerplate Swift file, and add this one plus RunActivityAttributes.swift
/// (shared, see that file's header comment).
struct RunActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            LockScreenRunView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(String(format: "%.2f mi", context.state.distanceMi), systemImage: "figure.run")
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(formatElapsed(context.state.elapsedSec))
                        .font(.headline.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.isPaused ? "Paused" : "\(context.state.paceLabel) /mi")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "figure.run")
            } compactTrailing: {
                Text(formatElapsed(context.state.elapsedSec))
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: "figure.run")
            }
        }
    }
}

private struct LockScreenRunView: View {
    let context: ActivityViewContext<RunActivityAttributes>

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(String(format: "%.2f mi", context.state.distanceMi))
                    .font(.title2.bold())
                Text(context.state.isPaused ? "Paused" : "\(context.state.paceLabel) /mi pace")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(formatElapsed(context.state.elapsedSec))
                .font(.title2.monospacedDigit())
        }
        .padding()
        .foregroundStyle(.white)
    }
}

private func formatElapsed(_ sec: Int) -> String {
    let h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}
