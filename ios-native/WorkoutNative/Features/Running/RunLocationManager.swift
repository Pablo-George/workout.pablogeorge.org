import CoreLocation
import Foundation

/// Native CLLocationManager-based run tracker. Unlike the earlier
/// Capacitor/JS approach, this sets `allowsBackgroundLocationUpdates` and
/// requests "Always" authorization directly, so tracking genuinely
/// continues with the phone locked or the app backgrounded — the whole
/// reason for going native here.
///
/// Requires in Info.plist: NSLocationWhenInUseUsageDescription,
/// NSLocationAlwaysAndWhenInUseUsageDescription, and UIBackgroundModes
/// containing "location".
@MainActor
final class RunLocationManager: NSObject, ObservableObject {
    @Published private(set) var route: [CLLocationCoordinate2D] = []
    @Published private(set) var distanceMi: Double = 0
    @Published private(set) var currentLocation: CLLocationCoordinate2D?
    @Published private(set) var isTracking = false
    @Published var authorizationDenied = false

    private let manager = CLLocationManager()
    private var lastAcceptedLocation: CLLocation?
    private static let maxAcceptableAccuracyMeters: CLLocationAccuracy = 50

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5 // meters
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
    }

    func start() {
        route = []
        distanceMi = 0
        lastAcceptedLocation = nil
        isTracking = true

        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestAlwaysAuthorization()
        } else if status == .denied || status == .restricted {
            authorizationDenied = true
            isTracking = false
            return
        }

        manager.allowsBackgroundLocationUpdates = true
        manager.startUpdatingLocation()
    }

    /// Stops receiving updates without discarding the accumulated route —
    /// used for user-initiated pause, distinct from stop() which is final.
    func pause() {
        manager.stopUpdatingLocation()
        lastAcceptedLocation = nil // avoid a phantom jump distance on resume
    }

    func resume() {
        manager.startUpdatingLocation()
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        isTracking = false
    }
}

extension RunLocationManager: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            let status = manager.authorizationStatus
            if status == .authorizedWhenInUse {
                // We asked for Always; iOS may only grant When In Use up
                // front. Background delivery needs Always, but tracking
                // still works in the foreground either way.
                manager.requestAlwaysAuthorization()
            } else if status == .denied || status == .restricted {
                authorizationDenied = true
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            guard location.horizontalAccuracy >= 0, location.horizontalAccuracy <= Self.maxAcceptableAccuracyMeters else { return }

            if let last = lastAcceptedLocation {
                let meters = location.distance(from: last)
                distanceMi += meters / 1609.344
            }
            lastAcceptedLocation = location
            currentLocation = location.coordinate
            route.append(location.coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Transient errors (e.g. kCLErrorLocationUnknown) are common and not
        // fatal — CoreLocation keeps trying on its own.
    }
}
