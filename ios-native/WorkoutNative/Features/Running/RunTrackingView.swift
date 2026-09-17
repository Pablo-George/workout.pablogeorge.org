import MapKit
import SwiftUI
import UIKit

struct RunTrackingView: View {
    @StateObject private var location = RunLocationManager()
    private let liveActivity = RunLiveActivityController()

    @State private var phase: RunPhase = .idle
    @State private var startedAt: Date?
    @State private var pausedAccumulated: TimeInterval = 0
    @State private var pauseStartedAt: Date?
    @State private var elapsedSec: Int = 0
    @State private var cameraPosition: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var saveError: String?
    @State private var isSaving = false

    let onSaved: () -> Void

    private enum RunPhase { case idle, tracking, paused }

    var body: some View {
        VStack(spacing: 0) {
            mapView
                .frame(maxHeight: .infinity)
                .overlay(alignment: .top) { statsBar }

            controls
                .padding()
                .background(.regularMaterial)
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            guard phase == .tracking, let startedAt else { return }
            elapsedSec = Int(Date().timeIntervalSince(startedAt) - pausedAccumulated)
            liveActivity.update(distanceMi: location.distanceMi, elapsedSec: elapsedSec, paceLabel: paceLabel, isPaused: false)
        }
        .alert("Location access needed", isPresented: $location.authorizationDenied) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Enable location access for this app in Settings to track a run.")
        }
        .alert("Couldn't save run", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })) {
            Button("OK") { saveError = nil }
        } message: {
            Text(saveError ?? "")
        }
    }

    private var mapView: some View {
        Map(position: $cameraPosition) {
            UserAnnotation()
            if location.route.count > 1 {
                MapPolyline(coordinates: location.route)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
            }
        }
        .mapControls { MapUserLocationButton() }
    }

    private var statsBar: some View {
        HStack(spacing: 24) {
            stat(value: String(format: "%.2f", location.distanceMi), label: "mi")
            stat(value: formatElapsed(elapsedSec), label: "time")
            stat(value: paceLabel, label: "/mi")
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 20)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding(.top, 8)
    }

    private func stat(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title2.monospacedDigit().bold())
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var controls: some View {
        Group {
            switch phase {
            case .idle:
                Button(action: startRun) {
                    Label("Start Run", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

            case .tracking, .paused:
                HStack(spacing: 12) {
                    Button(action: togglePause) {
                        Label(phase == .paused ? "Resume" : "Pause", systemImage: phase == .paused ? "play.fill" : "pause.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

                    Button(role: .destructive, action: stopRun) {
                        Label("Stop", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .controlSize(.large)
                    .disabled(isSaving)
                }
            }
        }
    }

    private var paceLabel: String {
        guard location.distanceMi >= 0.02 else { return "—" }
        let paceSec = Double(elapsedSec) / location.distanceMi
        let m = Int(paceSec) / 60, s = Int(paceSec) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func formatElapsed(_ sec: Int) -> String {
        let h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    private func startRun() {
        startedAt = Date()
        pausedAccumulated = 0
        elapsedSec = 0
        phase = .tracking
        location.start()
        liveActivity.start()
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func togglePause() {
        if phase == .tracking {
            phase = .paused
            pauseStartedAt = Date()
            location.pause()
        } else {
            if let pauseStartedAt { pausedAccumulated += Date().timeIntervalSince(pauseStartedAt) }
            pauseStartedAt = nil
            phase = .tracking
            location.resume()
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func stopRun() {
        let finalDistanceMi = location.distanceMi
        let finalElapsedSec = elapsedSec
        phase = .idle
        location.stop()
        liveActivity.end(distanceMi: finalDistanceMi, elapsedSec: finalElapsedSec, paceLabel: paceLabel)
        UINotificationFeedbackGenerator().notificationOccurred(.success)

        guard finalDistanceMi >= 0.02, finalElapsedSec >= 5 else { return }

        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                struct NewRun: Encodable {
                    let distanceMi: Double
                    let durationSec: Int
                    let loggedOn: String
                }
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                let body = NewRun(distanceMi: finalDistanceMi, durationSec: finalElapsedSec, loggedOn: formatter.string(from: Date()))
                let _: RunLog = try await APIClient.shared.post("/running", body: body)
                onSaved()
            } catch {
                saveError = error.localizedDescription
            }
        }
    }
}
